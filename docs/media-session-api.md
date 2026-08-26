# PARA Media Session API

PARA uses a generic Media Session contract for music, podcast, radio, and other long-form audio apps. The OS must never special-case Spotify or another provider.

## App declaration

A ParaStore app that wants background playback declares the `background_media` system feature in its Developer Portal project. Review can reject apps that request the feature but do not provide user-controlled media playback.

## Web runtime prototype

Trusted PARA web-app containers can access `window.PARA.mediaSession`.

```js
window.PARA.mediaSession.register({
  appId: 'com.example.music',
  appName: 'Example Music',
  title: 'Track title',
  artist: 'Artist',
  album: 'Album',
  artwork: 'https://…/cover.jpg',
  playbackState: 'playing',
  volume: 70
}, {
  play: () => audio.play(),
  pause: () => audio.pause(),
  previous: () => previousTrack(),
  next: () => nextTrack(),
  setVolume: (value) => { audio.volume = value }
})
```

Use `update()` when metadata or playback state changes and `clear()` when playback ends or the app signs out.

## OS behavior

- One foreground background-media session owns Control Center's Now Playing surface at a time.
- PARA Home music fades out while external media is playing and returns when that media pauses/ends.
- Sleep, sign-out, and shutdown lifecycle hooks remain authoritative over playback.
- Game audio and media audio are separate mix sources. The web prototype exposes desired balance state; native PARA audio will route actual per-process streams.
- Apps cannot claim microphone/voice-chat priority through Media Session.
