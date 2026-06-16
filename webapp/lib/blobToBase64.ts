// Convert a Blob (e.g. from lib/imageResize.resizeImageToBlob) to a base64 DATA
// URL. The Become AI vision tasks require a full `data:<mime>;base64,...` URL —
// the redbtn multimodal builder + @langchain/google-genai reject bare base64 and
// http URLs — so we keep the prefix.

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const r = reader.result
      if (typeof r === 'string') resolve(r)
      else reject(new Error('Failed to read blob'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}
