/**
 * Import Open Food Facts CSV into MongoDB
 *
 * Downloads the gzipped CSV export from Open Food Facts, streams it,
 * filters to products sold in US/UK/CA/AU with valid nutritional data,
 * and bulk-inserts into the `openfoodfacts` collection.
 *
 * Usage:
 *   npx tsx webapp/scripts/import-openfoodfacts.ts
 *
 * Environment:
 *   MONGODB_URI — MongoDB connection string (defaults to local dev)
 *
 * The script is idempotent: existing products (by barcode) are skipped.
 */

import { createWriteStream, createReadStream, existsSync, unlinkSync, statSync } from 'fs'
import { createGunzip } from 'zlib'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'
import mongoose from 'mongoose'
import 'dotenv/config'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CSV_URL = 'https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz'
const LOCAL_GZ = '/tmp/openfoodfacts.csv.gz'
const BATCH_SIZE = 5000
const ALLOWED_COUNTRIES = [
  'en:united-states',
  'en:united-kingdom',
  'en:canada',
  'en:australia'
]

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://admin:admin123@localhost:27017/jondonfitdb?authSource=admin'

// ---------------------------------------------------------------------------
// Category mapping — maps OFF category tags to our enum
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Record<string, string> = {
  'en:meats': 'Protein',
  'en:poultry': 'Protein',
  'en:fish': 'Protein',
  'en:seafood': 'Protein',
  'en:eggs': 'Protein',
  'en:plant-based-protein': 'Protein',
  'en:plant-based-foods-and-beverages': 'Protein',
  'en:breads': 'Grain',
  'en:cereals': 'Grain',
  'en:pastas': 'Grain',
  'en:rice': 'Grain',
  'en:grains': 'Grain',
  'en:breakfast-cereals': 'Grain',
  'en:crackers': 'Grain',
  'en:fruits': 'Fruit',
  'en:dried-fruits': 'Fruit',
  'en:fruit-juices': 'Fruit',
  'en:canned-fruits': 'Fruit',
  'en:vegetables': 'Vegetable',
  'en:canned-vegetables': 'Vegetable',
  'en:frozen-vegetables': 'Vegetable',
  'en:salads': 'Vegetable',
  'en:dairies': 'Dairy',
  'en:milks': 'Dairy',
  'en:cheeses': 'Dairy',
  'en:yogurts': 'Dairy',
  'en:butters': 'Dairy',
  'en:ice-creams': 'Dairy',
  'en:fats': 'Fat',
  'en:oils': 'Fat',
  'en:nuts': 'Fat',
  'en:seeds': 'Fat',
  'en:beverages': 'Beverage',
  'en:sodas': 'Beverage',
  'en:waters': 'Beverage',
  'en:teas': 'Beverage',
  'en:coffees': 'Beverage',
  'en:energy-drinks': 'Beverage',
  'en:sauces': 'Condiment',
  'en:condiments': 'Condiment',
  'en:dressings': 'Condiment',
  'en:spices': 'Condiment',
  'en:sweeteners': 'Condiment',
  'en:snacks': 'Snack',
  'en:chips': 'Snack',
  'en:cookies': 'Snack',
  'en:chocolates': 'Snack',
  'en:candies': 'Snack',
  'en:biscuits': 'Snack',
  'en:bars': 'Snack',
  'en:protein-bars': 'Snack'
}

// ---------------------------------------------------------------------------
// CSV columns we care about (by name)
// ---------------------------------------------------------------------------

const NEEDED_COLUMNS = [
  'code',
  'product_name',
  'brands',
  'categories_tags',
  'countries_tags',
  'serving_size',
  'energy-kcal_100g',
  'proteins_100g',
  'carbohydrates_100g',
  'fat_100g',
  'fiber_100g',
  'sugars_100g',
  'sodium_100g',
  'saturated-fat_100g',
  'nutriscore_grade',
  'image_url'
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseNumber(val: string | undefined): number | undefined {
  if (!val || val === '') return undefined
  const n = parseFloat(val)
  return isNaN(n) ? undefined : n
}

function mapCategory(categoriesTags: string | undefined): string {
  if (!categoriesTags) return 'Other'
  const tags = categoriesTags.split(',')
  for (const tag of tags) {
    const trimmed = tag.trim().toLowerCase()
    if (CATEGORY_MAP[trimmed]) return CATEGORY_MAP[trimmed]
  }
  return 'Other'
}

function parseServingSize(raw: string | undefined): { quantity: number | undefined; unit: string } {
  if (!raw) return { quantity: undefined, unit: 'g' }

  // Common patterns: "30g", "1 cup (240ml)", "100 ml", "2 tbsp (30g)"
  const match = raw.match(/^([\d.]+)\s*(g|ml|oz|cup|cups|tbsp|tsp|each|slice|scoop|fl\s*oz)?/i)
  if (match) {
    const quantity = parseFloat(match[1])
    let unit = (match[2] || 'g').toLowerCase().trim()
    // Normalize
    if (unit === 'cups') unit = 'cup'
    if (unit === 'fl oz') unit = 'ml'
    if (!['g', 'oz', 'cup', 'each', 'ml', 'tbsp', 'tsp', 'slice', 'scoop'].includes(unit)) {
      unit = 'g'
    }
    return { quantity: isNaN(quantity) ? undefined : quantity, unit }
  }

  return { quantity: undefined, unit: 'g' }
}

function matchesCountry(countriesTags: string | undefined): boolean {
  if (!countriesTags) return false
  const lower = countriesTags.toLowerCase()
  return ALLOWED_COUNTRIES.some(c => lower.includes(c))
}

// ---------------------------------------------------------------------------
// Simple CSV line parser (handles quoted fields with commas/newlines)
// ---------------------------------------------------------------------------

class CSVLineParser extends Transform {
  private buffer = ''
  private headerParsed = false
  private columnIndexes: Map<string, number> = new Map()
  private lineCount = 0

  constructor() {
    super({ objectMode: true })
  }

  _transform(chunk: Buffer, _encoding: string, callback: () => void) {
    this.buffer += chunk.toString('utf-8')

    // Safety: if buffer grows beyond 10MB, a malformed quoted field is likely
    // causing unbounded accumulation. Discard and reset.
    if (this.buffer.length > 10_000_000) {
      // Find the last newline and keep only what's after it
      const lastNl = this.buffer.lastIndexOf('\n')
      this.buffer = lastNl >= 0 ? this.buffer.slice(lastNl + 1) : ''
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const record = this.extractRecord()
      if (record === null) break

      if (!this.headerParsed) {
        // Parse header row
        const headers = this.parseCSVLine(record)
        for (let i = 0; i < headers.length; i++) {
          const h = headers[i].trim()
          if (NEEDED_COLUMNS.includes(h)) {
            this.columnIndexes.set(h, i)
          }
        }
        this.headerParsed = true
        continue
      }

      this.lineCount++
      const fields = this.parseCSVLine(record)
      const row: Record<string, string> = {}

      for (const [col, idx] of this.columnIndexes) {
        row[col] = fields[idx] || ''
      }

      this.push(row)
    }

    callback()
  }

  _flush(callback: () => void) {
    if (this.buffer.trim()) {
      const fields = this.parseCSVLine(this.buffer)
      const row: Record<string, string> = {}
      for (const [col, idx] of this.columnIndexes) {
        row[col] = fields[idx] || ''
      }
      this.push(row)
    }
    callback()
  }

  /**
   * Extract one complete CSV record from the buffer, respecting quoted fields.
   * Returns the record string or null if no complete record is available.
   */
  private extractRecord(): string | null {
    let inQuotes = false
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === '\n' && !inQuotes) {
        const line = this.buffer.slice(0, i).replace(/\r$/, '')
        this.buffer = this.buffer.slice(i + 1)
        return line
      }
    }
    return null
  }

  /**
   * Parse a single CSV line into fields. Handles double-quoted fields.
   * The OFF CSV uses tab as separator.
   */
  private parseCSVLine(line: string): string[] {
    // OFF CSV is actually tab-separated
    return line.split('\t').map(field => {
      if (field.startsWith('"') && field.endsWith('"')) {
        return field.slice(1, -1).replace(/""/g, '"')
      }
      return field
    })
  }
}

// ---------------------------------------------------------------------------
// Download with progress
// ---------------------------------------------------------------------------

async function downloadFile(url: string, dest: string): Promise<void> {
  // Check if already downloaded
  if (existsSync(dest)) {
    const stat = statSync(dest)
    if (stat.size > 1_000_000) {
      console.log(`  Using cached file (${(stat.size / 1e9).toFixed(2)} GB)`)
      return
    }
    // File too small, probably corrupt — re-download
    unlinkSync(dest)
  }

  console.log(`  Downloading from ${url}...`)
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0', 10)
  let downloaded = 0
  let lastPct = -1

  const writer = createWriteStream(dest)
  const reader = res.body.getReader()

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    writer.write(value)
    downloaded += value.byteLength
    if (contentLength > 0) {
      const pct = Math.floor((downloaded / contentLength) * 100)
      if (pct !== lastPct && pct % 5 === 0) {
        process.stdout.write(`\r  Download: ${pct}% (${(downloaded / 1e9).toFixed(2)} / ${(contentLength / 1e9).toFixed(2)} GB)`)
        lastPct = pct
      }
    }
  }

  writer.end()
  await new Promise<void>((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
  console.log('\n  Download complete.')
}

// ---------------------------------------------------------------------------
// Main import
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== Open Food Facts Import ===\n')

  // Step 1: Download
  console.log('[1/4] Downloading CSV...')
  await downloadFile(CSV_URL, LOCAL_GZ)

  // Step 2: Connect to MongoDB
  console.log('\n[2/4] Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI, { bufferCommands: false })
  console.log('  Connected.')

  const db = mongoose.connection.db!
  const collection = db.collection('openfoodfacts')

  // Step 3: Create indexes
  console.log('\n[3/4] Ensuring indexes...')
  await collection.createIndex({ code: 1 }, { unique: true })
  await collection.createIndex(
    { product_name: 'text', brands: 'text' },
    { weights: { product_name: 10, brands: 5 } }
  )
  await collection.createIndex({ category: 1 })
  console.log('  Indexes ready.')

  // Step 4: Stream, parse, and insert
  console.log('\n[4/4] Importing products...')

  // Get existing barcodes for idempotency
  console.log('  Loading existing barcodes...')
  const existingCodes = new Set<string>()
  const cursor = collection.find({}, { projection: { code: 1, _id: 0 } })
  for await (const doc of cursor) {
    existingCodes.add(doc.code as string)
  }
  console.log(`  Found ${existingCodes.size} existing products to skip.`)

  let processed = 0
  let imported = 0
  let skippedNoName = 0
  let skippedNoCalories = 0
  let skippedCountry = 0
  let skippedDuplicate = 0
  let batchErrors = 0
  let batch: Record<string, unknown>[] = []
  const startTime = Date.now()

  const gunzip = createGunzip()
  const csvParser = new CSVLineParser()

  const fileStream = createReadStream(LOCAL_GZ)

  const processRow = (row: Record<string, string>) => {
    processed++

    // Filter: must have product_name
    const productName = row['product_name']?.trim()
    if (!productName) {
      skippedNoName++
      return null
    }

    // Filter: must have calories
    const kcal = parseNumber(row['energy-kcal_100g'])
    if (kcal === undefined || kcal <= 0) {
      skippedNoCalories++
      return null
    }

    // Filter: must be sold in target countries
    if (!matchesCountry(row['countries_tags'])) {
      skippedCountry++
      return null
    }

    // Filter: skip duplicates
    const code = row['code']?.trim()
    if (!code) return null
    if (existingCodes.has(code)) {
      skippedDuplicate++
      return null
    }

    // Parse serving size
    const { quantity: servingQuantity, unit: servingUnit } = parseServingSize(row['serving_size'])

    // Map category
    const category = mapCategory(row['categories_tags'])

    return {
      code,
      product_name: productName,
      brands: row['brands']?.trim() || undefined,
      category,
      categories_tags: row['categories_tags']?.trim() || undefined,
      countries_tags: row['countries_tags']?.trim() || undefined,
      nutriments: {
        energy_kcal_100g: kcal,
        proteins_100g: parseNumber(row['proteins_100g']),
        carbohydrates_100g: parseNumber(row['carbohydrates_100g']),
        fat_100g: parseNumber(row['fat_100g']),
        fiber_100g: parseNumber(row['fiber_100g']),
        sugars_100g: parseNumber(row['sugars_100g']),
        sodium_100g: parseNumber(row['sodium_100g']),
        saturated_fat_100g: parseNumber(row['saturated-fat_100g'])
      },
      serving_size: row['serving_size']?.trim() || undefined,
      serving_quantity: servingQuantity,
      serving_unit: servingUnit,
      nutriscore_grade: row['nutriscore_grade']?.trim() || undefined,
      image_url: row['image_url']?.trim() || undefined
    }
  }

  const flushBatch = async () => {
    if (batch.length === 0) return

    try {
      const result = await collection.bulkWrite(
        batch.map(doc => ({
          insertOne: { document: doc }
        })),
        { ordered: false }
      )
      imported += result.insertedCount
    } catch (err: unknown) {
      // Duplicate key errors are expected for concurrent runs
      if (err && typeof err === 'object' && 'insertedCount' in err) {
        imported += (err as { insertedCount: number }).insertedCount
      } else {
        batchErrors++
        console.error(`\n  Batch error: ${err}`)
      }
    }

    batch = []
  }

  // Process stream using pipeline + transform
  const processor = new Transform({
    objectMode: true,
    transform(row: Record<string, string>, _encoding, callback) {
      const doc = processRow(row)
      if (doc) {
        batch.push(doc)
        existingCodes.add(doc.code) // Prevent in-run duplicates
      }

      // Progress logging
      if (processed % 100_000 === 0) {
        const elapsed = (Date.now() - startTime) / 1000
        const rate = Math.round(processed / elapsed)
        process.stdout.write(`\r  Processed: ${processed.toLocaleString()} | Imported: ${imported.toLocaleString()} | Rate: ${rate.toLocaleString()}/s | Batch: ${batch.length}`)
      }

      if (batch.length >= BATCH_SIZE) {
        flushBatch().then(() => callback()).catch(callback)
      } else {
        callback()
      }
    },
    async flush(callback) {
      try {
        await flushBatch()
        callback()
      } catch (err) {
        callback(err as Error)
      }
    }
  })

  await pipeline(
    fileStream,
    gunzip,
    csvParser,
    processor
  )

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n\n=== Import Complete ===')
  console.log(`  Total rows processed: ${processed.toLocaleString()}`)
  console.log(`  Imported:             ${imported.toLocaleString()}`)
  console.log(`  Skipped (no name):    ${skippedNoName.toLocaleString()}`)
  console.log(`  Skipped (no cal):     ${skippedNoCalories.toLocaleString()}`)
  console.log(`  Skipped (country):    ${skippedCountry.toLocaleString()}`)
  console.log(`  Skipped (duplicate):  ${skippedDuplicate.toLocaleString()}`)
  console.log(`  Batch errors:         ${batchErrors}`)
  console.log(`  Time elapsed:         ${elapsed}s`)

  // Final count
  const totalDocs = await collection.countDocuments()
  console.log(`\n  Total docs in collection: ${totalDocs.toLocaleString()}`)

  await mongoose.disconnect()
  console.log('\nDone.')
}

main().catch(err => {
  console.error('\nFatal error:', err)
  process.exit(1)
})
