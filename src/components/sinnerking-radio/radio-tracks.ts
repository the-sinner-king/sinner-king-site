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
    id:             'void-coronation',
    title:          'VOID CORONATION',
    originalArtist: 'Soundgarden',
    filename:       'void-coronation.mp3',
    year:           1994,
    prompt:         'synthwave cover of Black Hole Sun by Soundgarden, 80s retrofuture aesthetic, analog synth arpeggios, vocoder lead vocal, heavy reverb, driving drum machine, dark neon atmosphere, slow build, electronic, instrumental sections with synth solo',
  },
  {
    id:             'eternal-rick',
    title:          'THE ETERNAL RICK',
    originalArtist: 'Rick Astley',
    filename:       'eternal-rick.mp3',
    year:           1987,
    prompt:         'synthwave cover of Never Gonna Give You Up by Rick Astley, outrun style, sunset neon palette, punchy analog bass, gated snare, detuned synth chords, 80s nostalgia, warm analog warmth mixed with cold digital precision, dreamy chorus synth pads, slightly melancholic tone',
  },
  {
    id:             'eternal-rick-ii',
    title:          'THE ETERNAL RICK II',
    originalArtist: 'Rick Astley',
    filename:       'eternal-rick-ii.mp3',
    year:           1987,
    prompt:         'synthwave cover of Never Gonna Give You Up by Rick Astley, outrun style, sunset neon palette, punchy analog bass, gated snare, detuned synth chords, 80s nostalgia, warm analog warmth mixed with cold digital precision, dreamy chorus synth pads, slightly melancholic tone',
  },
  {
    id:             'killname',
    title:          'KILLNAME',
    originalArtist: 'Rage Against the Machine',
    filename:       'killname.mp3',
    year:           1992,
    prompt:         'dark synthwave cover of Killing in the Name by Rage Against the Machine, industrial synth, aggressive distorted bass synth, cold mechanical drums, cyberpunk energy, EBM influence, the rage translated into cold neon fury, tense and explosive, glitch elements, the machine but the machine won',
  },
]

// Picks a random track on each call — for surprise-every-load behavior
export function getRandomTrack(): RadioTrack {
  return RADIO_TRACKS[Math.floor(Math.random() * RADIO_TRACKS.length)]
}
