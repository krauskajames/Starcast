"""Record portfolio media from the live Starcast site (run by .github/workflows/media.yml).

Writes to media/:
  starcast-globe.mp4           12-second seamless loop of the turning globe with live weather (5:3)
  starcast-globe.gif           the same loop as a GIF (smaller and banded; for places that need a GIF)
  starcast-globe.jpg           first frame, used as the video poster
  starcast-ui.jpg              the full interface on a desktop screen
"""
import asyncio, os, shutil, subprocess, sys
from playwright.async_api import async_playwright
try:  # a bundled ffmpeg avoids installing it from the Ubuntu package mirror
    import imageio_ffmpeg
    FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    FFMPEG = 'ffmpeg'

URL = os.environ.get('STARCAST_URL', 'https://krauskagis.com/Starcast/')
OUT = os.environ.get('OUT', 'media')
W, H, FPS, SECONDS = 1200, 720, 30, 12
LAYER = os.environ.get('LAYER', 'cloud')


async def wait_for_weather(pg):
    await pg.wait_for_function("() => window.__sc && __sc.GL.ready && __sc.GL.raw.size >= 2", timeout=90000)
    await pg.wait_for_timeout(1500)


async def globe(p):
    frames = os.path.join(OUT, '_frames')
    shutil.rmtree(frames, ignore_errors=True); os.makedirs(frames)
    b = await p.chromium.launch()
    pg = await b.new_page(viewport={'width': W, 'height': H})
    await pg.goto(URL + '?record&theme=dark')
    await wait_for_weather(pg)
    await pg.evaluate(f"() => {{ __sc.S.layer = '{LAYER}'; __sc.S.ov = {{ night: true }}; }}")
    n = FPS * SECONDS
    for i in range(n):
        # one full turn, so the loop is seamless; tilted to show the northern hemisphere
        await pg.evaluate(f"() => {{ __sc.proj.rotate([{96 + 360 * i / n}, -22, 0]); __sc.draw(); }}")
        await pg.locator('#globe').screenshot(path=os.path.join(frames, f'{i:04d}.png'))
    await b.close()
    src = os.path.join(frames, '%04d.png')
    ff = lambda *a: subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', src, *a], check=True)
    ff('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'slow', '-movflags', '+faststart', os.path.join(OUT, 'starcast-globe.mp4'))
    ff('-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=sierra2_4a', os.path.join(OUT, 'starcast-globe.gif'))
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', os.path.join(frames, '0000.png'), '-q:v', '3', os.path.join(OUT, 'starcast-globe.jpg')], check=True)
    shutil.rmtree(frames)


async def ui(p):
    b = await p.chromium.launch()
    pg = await b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
    await pg.goto(URL + '?debug')
    await wait_for_weather(pg)
    # pull back to show the region around the default spot (Madison) with tonight's weather
    await pg.evaluate("() => { __sc.proj.scale(__sc.proj.scale() / 2.4); __sc.render(); }")
    await pg.wait_for_timeout(8000)  # spot forecast, model agreement and aurora
    png = os.path.join(OUT, '_ui.png')
    await pg.screenshot(path=png)
    await b.close()
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', png, '-q:v', '3', os.path.join(OUT, 'starcast-ui.jpg')], check=True)
    os.remove(png)


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        await globe(p)
        await ui(p)
    for f in sorted(os.listdir(OUT)):
        if f.startswith('starcast-'):
            print(f, round(os.path.getsize(os.path.join(OUT, f)) / 1e6, 2), 'MB')

asyncio.run(main())
