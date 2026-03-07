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
// Brandon sources them — the component works with any MP3 dropped in /public/audio/.
// ---------------------------------------------------------------------------

export interface RadioTrack {
  id:             string
  title:          string
  originalArtist: string
  filename:       string   // relative to /audio/ — e.g. "black-hole-sun.mp3"
  prompt:         string   // full Suno/Udio prompt — copied to clipboard via COPY PROMPT
  year:           number   // original release year
}

export const RADIO_TRACKS: RadioTrack[] = [
  {
    id:             'black-hole-sun',
    title:          'Black Hole Sun',
    originalArtist: 'Soundgarden',
    filename:       'black-hole-sun-synthwave.mp3',
    year:           1994,
    prompt:         'synthwave cover of Black Hole Sun by Soundgarden, 80s retrofuture aesthetic, analog synth arpeggios, vocoder lead vocal, heavy reverb, driving drum machine, dark neon atmosphere, slow build, electronic, instrumental sections with synth solo',
  },
  {
    id:             'never-gonna-give-you-up',
    title:          'Never Gonna Give You Up',
    originalArtist: 'Rick Astley',
    filename:       'never-gonna-give-you-up-synthwave.mp3',
    year:           1987,
    prompt:         'synthwave cover of Never Gonna Give You Up by Rick Astley, outrun style, sunset neon palette, punchy analog bass, gated snare, detuned synth chords, 80s nostalgia, warm analog warmth mixed with cold digital precision, dreamy chorus synth pads, slightly melancholic tone',
  },
  {
    id:             'head-like-a-hole',
    title:          'Head Like a Hole',
    originalArtist: 'Nine Inch Nails',
    filename:       'head-like-a-hole-synthwave.mp3',
    year:           1989,
    prompt:         'dark synthwave cover of Head Like a Hole by Nine Inch Nails, industrial synth, aggressive bass, distorted electronic drums, cold atmosphere, cyberpunk aesthetic, EBM influence, tension-building synth stabs, glitch elements, dark neon grid, menacing energy',
  },
  {
    id:             'blue',
    title:          'Blue (Da Ba Dee)',
    originalArtist: 'Eiffel 65',
    filename:       'blue-synthwave.mp3',
    year:           1998,
    prompt:         'vaporwave synthwave cover of Blue Da Ba Dee by Eiffel 65, slowed and dreamy, analog synth lead, lo-fi tape warmth, sunset palette, nostalgic glitch texture, floating chords, chill outrun vibes, slightly eerie undertone, retro futurism',
  },
  {
    id:             'take-on-me',
    title:          'Take On Me',
    originalArtist: 'a-ha',
    filename:       'take-on-me-synthwave.mp3',
    year:           1985,
    prompt:         'synthwave cover of Take On Me by a-ha, dark outrun interpretation, driving arpeggiated bass synth, dramatic synth stabs, heavier drum machine, neon-drenched atmosphere, emotional lead synth melody, cinematic scope, the original but from a parallel dimension where everything got more serious',
  },
  {
    id:             'somebody-that-i-used-to-know',
    title:          'Somebody That I Used to Know',
    originalArtist: 'Gotye',
    filename:       'somebody-synthwave.mp3',
    year:           2011,
    prompt:         'melancholic synthwave cover of Somebody That I Used to Know by Gotye, slow burning analog synths, haunting lead melody, deep reverb, sparse minimal arrangement, emotional weight, outrun melancholy, the kind of song you hear in a neon-lit bar at 3am, cold and warm at the same time',
  },
  {
    id:             'gangsters-paradise',
    title:          "Gangsta's Paradise",
    originalArtist: 'Coolio ft. L.V.',
    filename:       'gangstas-paradise-synthwave.mp3',
    year:           1995,
    prompt:         "synthwave cover of Gangsta's Paradise by Coolio, dark cinematic atmosphere, minor key analog synth, dramatic orchestral synth strings, deep bass undertow, 80s tension, gothic undertone mixed with hip-hop energy, the choir translated to ethereal synth pads, heavy and contemplative",
  },
  {
    id:             'all-star',
    title:          'All Star',
    originalArtist: 'Smash Mouth',
    filename:       'all-star-synthwave.mp3',
    year:           1999,
    prompt:         'ironic sincere synthwave cover of All Star by Smash Mouth, earnest outrun treatment, punchy analog drums, warm synth brass, driving bass, summer sunset aesthetic, the song played completely straight but rebuilt entirely from analog synthesizers, somehow both ridiculous and genuinely moving',
  },
]

// Picks a random track on each call — for surprise-every-load behavior
export function getRandomTrack(): RadioTrack {
  return RADIO_TRACKS[Math.floor(Math.random() * RADIO_TRACKS.length)]
}
