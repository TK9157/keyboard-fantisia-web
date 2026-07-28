# Media Directory Structure

This directory contains the media assets for Keyboard Fantasia.

## Directory Layout

```
media/
├── audio/          # Audio files (.mp3)
│   ├── c1_track01.mp3 to c1_track10.mp3   (Cassette Vol 1)
│   ├── c2_track01.mp3 to c2_track10.mp3   (Cassette Vol 2)
│   ├── c3_track01.mp3 to c3_track10.mp3   (Cassette Vol 3)
│   ├── c4_track01.mp3 to c4_track10.mp3   (Cassette Vol 4)
│   ├── c5_track01.mp3 to c5_track10.mp3   (Cassette Vol 5)
│   └── c6_track01.mp3 to c6_track10.mp3   (Cassette Vol 6)
│
├── video/          # Video files (.mp4)
│   ├── c1_track01.mp4 to c1_track10.mp4   (matching videos)
│   └── ... (same naming pattern)
│
└── photos/
    ├── pradeep_n.jpg      # Artist photo for left tweeter
    ├── s1/                # Photo Set 1 (for Cassette Vol 1)
    │   ├── photo01.jpg to photo10.jpg
    ├── s2/                # Photo Set 2 (for Cassette Vol 2)
    ├── s3/                # Photo Set 3 (for Cassette Vol 3)
    ├── s4/                # Photo Set 4 (for Cassette Vol 4)
    ├── s5/                # Photo Set 5 (for Cassette Vol 5)
    └── s6/                # Photo Set 6 (for Cassette Vol 6)
```

## Adding Media

1. **Audio/Video**: Place your instrumental track files in the respective folders following the naming convention `cX_trackNN.mp3/.mp4`.
2. **Photos**: Place performance photos in the numbered set folders (s1 through s6). Update the `photoSets` in `data/cassettes.json` with the file paths.
3. **Artist Photo**: Replace `pradeep_n.jpg` with your actual photo.

## File Format Guidelines
- **Audio**: MP3, M4A, or WAV (MP3 recommended for web)
- **Video**: MP4 with H.264 codec (best browser compatibility)
- **Photos**: JPG or PNG (keep under 500KB each for fast loading)
