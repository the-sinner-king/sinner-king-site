// ---------------------------------------------------------------------------
// SINNER KING RADIO — Track Library
//
// Synthwave AI covers of songs that shouldn't exist this way.
// Generated via Suno.ai. Each track ships with its generation prompt
// so visitors can steal it and make their own.
//
// To add tracks:
//   1. Drop MP3 into /public/audio/
//   2. Add entry below with the exact Suno prompt used
//
// Audio files are NOT included in the repo (git-ignored).
// ---------------------------------------------------------------------------

export interface RadioTrack {
  id:             string
  title:          string
  originalArtist: string
  filename:       string   // relative to /audio/ — e.g. "void-coronation.mp3"
  prompt:         string   // full Suno/Udio prompt — copied to clipboard via COPY PROMPT
  year:           number   // original release year
}

export const RADIO_TRACKS: RadioTrack[] = [
  {
    id:             'pure-imagination',
    title:          'PURE IMAGINATION',
    originalArtist: 'Willy Wonka & the Chocolate Factory',
    filename:       'pure-imagination.mp3',
    year:           1971,
    prompt:         'synthwave cover of Pure Imagination from Willy Wonka and the Chocolate Factory, dreamy retrofuture atmosphere, lush analog synth pads, gentle arpeggiator, soft vocoder warmth, childlike wonder translated into neon, slow and ethereal, emotional resonance, floating and weightless',
  },
  {
    id:             'eternal-rick',
    title:          'THE ETERNAL RICK',
    originalArtist: 'Rick Astley',
    filename:       'eternal-rick.mp3',
    year:           1987,
    prompt:         'synthwave cover of Never Gonna Give You Up by Rick Astley, outrun style, sunset neon palette, punchy analog bass, gated snare, detuned synth chords, 80s nostalgia, warm analog warmth mixed with cold digital precision, dreamy chorus synth pads, slightly melancholic tone',
  },
]

// Picks a random track on each call — for surprise-every-load behavior
export function getRandomTrack(): RadioTrack {
  return RADIO_TRACKS[Math.floor(Math.random() * RADIO_TRACKS.length)]
}
