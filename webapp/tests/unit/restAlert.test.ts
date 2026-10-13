// NP-210 (Jon, 2026-10-13, second reply on NP-028): "there should be the
// locked screen rest timer asking giving both sound and silent vibrations
// when the timer is done" — both signals, every time, never a sound-or-
// silent choice. This pins the ONE alert function both Live and Track call
// at zero (liveRestAlert.test.ts and trackRestTimer.test.ts pin that each
// view actually calls it).

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  fireRestAlert,
  vibrateRestAlert,
  playRestAlertSound,
  REST_ALERT_VIBRATION_PATTERN,
} from '@/lib/workout/restAlert'

// A minimal stand-in for the Web Audio API — just enough to prove a tone was
// actually constructed and started, without needing jsdom/real audio.
class FakeOscillator {
  type = ''
  frequency = { value: 0 }
  started: number[] = []
  stopped: number[] = []
  connect() {}
  start(t: number) { this.started.push(t) }
  stop(t: number) { this.stopped.push(t) }
}
class FakeGain {
  gain = {
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
  }
  connect() {}
}
class FakeAudioContext {
  currentTime = 0
  destination = {}
  oscillators: FakeOscillator[] = []
  createOscillator() {
    const osc = new FakeOscillator()
    this.oscillators.push(osc)
    return osc as unknown as OscillatorNode
  }
  createGain() {
    return new FakeGain() as unknown as GainNode
  }
  close() {
    return Promise.resolve()
  }
}

describe('fireRestAlert — both signals, always', () => {
  it('vibrates AND plays a sound in one call', () => {
    let vibratedWith: number | number[] | undefined
    const vibrate = (pattern: number | number[]) => {
      vibratedWith = pattern
      return true
    }
    const fakeCtx = new FakeAudioContext()
    fireRestAlert({ vibrate, AudioContextCtor: function () { return fakeCtx } as unknown as new () => AudioContext })

    assert.deepEqual(vibratedWith, REST_ALERT_VIBRATION_PATTERN, 'vibration must fire with the shared pattern')
    assert.equal(fakeCtx.oscillators.length, 2, 'the sound alert must actually start oscillators (two short beeps)')
    for (const osc of fakeCtx.oscillators) {
      assert.equal(osc.started.length, 1, 'each beep must be started')
      assert.equal(osc.stopped.length, 1, 'each beep must be stopped (not left running)')
    }
  })

  it('still vibrates when sound construction throws (never goes fully silent)', () => {
    let vibrateCalled = false
    const vibrate = () => {
      vibrateCalled = true
      return true
    }
    const throwingCtor = function () {
      throw new Error('AudioContext not allowed yet (autoplay policy)')
    } as unknown as new () => AudioContext

    assert.doesNotThrow(() => fireRestAlert({ vibrate, AudioContextCtor: throwingCtor }))
    assert.equal(vibrateCalled, true)
  })

  it('still plays the sound when vibration is unavailable (desktop browsers)', () => {
    const fakeCtx = new FakeAudioContext()
    fireRestAlert({ vibrate: undefined, AudioContextCtor: function () { return fakeCtx } as unknown as new () => AudioContext })
    assert.equal(fakeCtx.oscillators.length, 2)
  })
})

describe('vibrateRestAlert / playRestAlertSound — the two signals in isolation', () => {
  it('vibrateRestAlert uses the shared pattern', () => {
    let seen: number | number[] | undefined
    vibrateRestAlert({ vibrate: (p) => { seen = p; return true } })
    assert.deepEqual(seen, REST_ALERT_VIBRATION_PATTERN)
  })

  it('playRestAlertSound is a no-op (not a throw) with no AudioContext available', () => {
    assert.doesNotThrow(() => playRestAlertSound({ AudioContextCtor: undefined }))
  })

  it('playRestAlertSound starts two beeps with a real AudioContext stand-in', () => {
    const fakeCtx = new FakeAudioContext()
    playRestAlertSound({ AudioContextCtor: function () { return fakeCtx } as unknown as new () => AudioContext })
    assert.equal(fakeCtx.oscillators.length, 2)
  })
})
