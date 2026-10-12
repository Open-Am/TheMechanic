"""Encodes the game's sounds: each moment's source trimmed, faded, mono, 48 kHz, Ogg Opus (plan 0013 step 3, ADR 0018).

    node tools/run-blender.mjs tools/blender/audio.py [-- --sounds <sounds.json> --source <dir> --out <dir>]

Reads assets/audio/sounds.json; takes each moment's original from assets/audio/source/ (not committed: the owner
downloads them from the URLs in sounds.json); writes assets/audio/export/<moment>.ogg. A moment with no source chosen,
or whose file is not there, is skipped and named. tools/pipeline/check.ts --audio then keeps only the Opus stream,
copies the files into the game and checks them.

How: Blender's sound mixdown operator cannot write Opus in 4.5 (its codecs are AAC, AC3, FLAC, MP2, MP3, PCM and
Vorbis), but the FFmpeg render output can. So each sound goes on the sequencer, trimmed with the strip's ends and
faded with keyframes on its volume, and the scene is rendered as an Ogg file with Opus audio, mono, at 100 frames a
second (10 ms steps) on a 16 x 16 px Workbench frame. Blender also writes a Theora video stream, even with no video
codec chosen; check.ts drops it.
"""

import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

common.check_version()

FPS = 100
BITRATE_KBPS = 40  # plan 0013: 32 to 48 kbps
MIXRATE = 48000


def option(argv, name, fallback):
    return os.path.abspath(argv[argv.index(name) + 1]) if name in argv and argv.index(name) + 1 < len(argv) else fallback


def encode(scene, src, out, row):
    ed = scene.sequence_editor or scene.sequence_editor_create()
    for s in list(ed.strips):
        ed.strips.remove(s)
    if scene.animation_data:
        scene.animation_data_clear()
    start, end = float(row.get("start", 0)), float(row.get("end", 0))
    fade_in, fade_out = float(row.get("fadeIn", 0)), float(row.get("fadeOut", 0))
    gain = 10 ** (float(row.get("gainDb", 0)) / 20)
    scene.render.fps, scene.render.fps_base = FPS, 1  # before the strip, so its length is counted in 10 ms frames
    strip = ed.strips.new_sound("sound", src, 1, 1)
    strip.sound.use_mono = True
    length = strip.frame_duration  # the whole source, in frames
    if end <= start:
        end = length / FPS
    if end * FPS > length + 1:
        common.fail(f"{os.path.basename(src)}: trim end {end} s is past its end ({length / FPS:.2f} s).")
    # Slide the sound left so `start` lands on frame 1, then cut both ends.
    strip.frame_start = 1 - round(start * FPS)
    strip.frame_final_start = 1
    strip.frame_final_end = 1 + round((end - start) * FPS)
    last = strip.frame_final_end - 1
    scene.frame_start, scene.frame_end = 1, last
    # Volume: the gain, with linear fades in and out.
    keys = [(1, 0.0 if fade_in > 0 else gain)]
    if fade_in > 0:
        keys.append((1 + round(fade_in * FPS), gain))
    if fade_out > 0:
        keys.append((max(1, last - round(fade_out * FPS)), gain))
        keys.append((last, 0.0))
    for frame, value in keys:
        strip.volume = value
        strip.keyframe_insert("volume", frame=frame)

    r = scene.render
    r.engine = "BLENDER_WORKBENCH"
    r.resolution_x = r.resolution_y = 16
    r.resolution_percentage = 100
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format = "OGG"
    r.ffmpeg.codec = "NONE"
    r.ffmpeg.audio_codec = "OPUS"
    r.ffmpeg.audio_channels = "MONO"
    r.ffmpeg.audio_mixrate = MIXRATE
    r.ffmpeg.audio_bitrate = BITRATE_KBPS
    r.use_file_extension = False
    r.filepath = out
    if os.path.exists(out):
        os.remove(out)
    bpy.ops.render.render(animation=True)
    if not os.path.exists(out):
        common.fail(f"Blender wrote nothing at {out}.")
    return (end - start), os.path.getsize(out)


def main():
    argv = common.args()
    root = common.ROOT
    sounds_path = option(argv, "--sounds", os.path.join(root, "assets", "audio", "sounds.json"))
    source_dir = option(argv, "--source", os.path.join(root, "assets", "audio", "source"))
    out_dir = option(argv, "--out", os.path.join(root, "assets", "audio", "export"))
    with open(sounds_path, encoding="utf-8") as f:
        sounds = json.load(f)["sounds"]
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    done, skipped = [], []
    for moment, row in sounds.items():
        name = row.get("source")
        src = os.path.join(source_dir, name) if name else None
        if not src or not os.path.exists(src):
            skipped.append(f"{moment} ({'no source chosen' if not name else 'not downloaded: ' + name})")
            continue
        seconds, size = encode(scene, src, os.path.join(out_dir, f"{moment}.ogg"), row)
        done.append(f"{moment} {seconds:.2f} s {size / 1000:.1f} KB")
    print("AUDIO encoded: " + (", ".join(done) if done else "none"))
    if skipped:
        print("AUDIO skipped: " + ", ".join(skipped))


main()
