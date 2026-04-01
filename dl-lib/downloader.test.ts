import { describe, expect, it } from 'vitest'

import { normalizeExecutablePath, resolveFfmpegExecutablePath, stripLeadingId3Tags } from './downloader'

describe('stripLeadingId3Tags', () => {
  it('removes a leading ID3v2 tag from an AAC chunk payload', () => {
    const id3Header = Buffer.from([
      0x49, 0x44, 0x33,
      0x04, 0x00,
      0x00,
      0x00, 0x00, 0x00, 0x04
    ])
    const id3Body = Buffer.from([0x74, 0x65, 0x73, 0x74])
    const aacPayload = Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x00])
    const input = Buffer.concat([id3Header, id3Body, aacPayload])

    expect(stripLeadingId3Tags(input)).toEqual(aacPayload)
  })

  it('leaves chunks without an ID3 header unchanged', () => {
    const aacPayload = Buffer.from([0xff, 0xf1, 0x50, 0x80, 0x00])

    expect(stripLeadingId3Tags(aacPayload)).toEqual(aacPayload)
  })

  it('normalizes a quoted ffmpeg path from Windows inputs', () => {
    expect(normalizeExecutablePath('"C:\\ffmpeg\\bin\\ffmpeg.exe"')).toBe('C:\\ffmpeg\\bin\\ffmpeg.exe')
  })

  it('falls back to the system ffmpeg command when the path is blank', () => {
    expect(normalizeExecutablePath('   ')).toBe('ffmpeg')
  })

  it('rejects a missing custom ffmpeg executable with a clear message', async () => {
    await expect(resolveFfmpegExecutablePath('/definitely/missing/ffmpeg.exe')).rejects.toThrow(
      'ffmpeg binary not found at: /definitely/missing/ffmpeg.exe'
    )
  })
})
