"""Writes the scanner's feedback tones into assets/sounds/.

Four tones someone can tell apart without looking at the screen, in a
warehouse, with a PDA on their belt:

  ok.wav         a bright "pling", like a struck glass — counted, carry on
  already.wav    two short lower tones — this one was counted already
  attention.wav  three rising tones — look at the screen, something needs you
  error.wav      two falling, rougher tones — that did not work

Sine tones, 44.1 kHz mono 16-bit, so they play the same on every device and
weigh a few kilobytes. The two warnings are plain tones with a short fade; the
"pling" strikes at once and rings out, with the inharmonic overtones of a
small bell, because the one heard most often should be the pleasant one. Re-run after changing them:

    python3 tool/scan_tones.py
"""

import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "assets" / "sounds"


def tone(freq: float, ms: int, volume: float = 0.6) -> list[float]:
    n = int(RATE * ms / 1000)
    fade = int(RATE * 0.008)  # 8 ms in and out, or the edges click
    samples = []
    for i in range(n):
        envelope = min(1.0, i / fade, (n - i) / fade)
        samples.append(volume * envelope * math.sin(2 * math.pi * freq * i / RATE))
    return samples


def pling(freq: float, ms: int, volume: float = 0.55) -> list[float]:
    n = int(RATE * ms / 1000)
    attack = int(RATE * 0.002)
    # A small bell's partials: the fundamental, then two overtones that are
    # not whole multiples of it and die away faster.
    partials = [(1.0, 1.0, 9.0), (2.76, 0.35, 16.0), (5.4, 0.12, 28.0)]
    samples = []
    for i in range(n):
        t = i / RATE
        onset = min(1.0, i / attack)
        tail = min(1.0, (n - i) / (RATE * 0.01))  # no click where the file ends
        s = sum(a * math.exp(-d * t) * math.sin(2 * math.pi * freq * r * t) for r, a, d in partials)
        samples.append(volume * onset * tail * s / 1.47)
    return samples


def buzz(freq: float, ms: int, volume: float = 0.45) -> list[float]:
    """A tone with odd harmonics — halfway to a square wave, so it sounds wrong."""
    n = int(RATE * ms / 1000)
    fade = int(RATE * 0.008)
    samples = []
    for i in range(n):
        envelope = min(1.0, i / fade, (n - i) / fade)
        t = i / RATE
        s = sum(math.sin(2 * math.pi * freq * k * t) / k for k in (1, 3, 5, 7))
        samples.append(volume * envelope * s / 1.3)
    return samples


def silence(ms: int) -> list[float]:
    return [0.0] * int(RATE * ms / 1000)


def write(name: str, samples: list[float]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / name), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b"".join(struct.pack("<h", int(s * 32767)) for s in samples))


write("ok.wav", pling(1760, 380))
write("already.wav", tone(784, 70) + silence(60) + tone(784, 70))
write("error.wav", buzz(440, 140) + silence(40) + buzz(294, 220))
write("attention.wav", tone(660, 90) + silence(30) + tone(880, 90) + silence(30) + tone(1175, 140))
