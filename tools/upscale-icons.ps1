# Enlarges the game's 48x51 character icons four times with xBR, the pixel-art
# filter emulators such as Dolphin use. It is a fixed rule applied to the pixels,
# not AI: it smooths edges and shading but adds no detail.
#
# xBR ignores transparency, so the color and the see-through mask are enlarged
# separately and put back together. The untouched icons stay in
# assets/mugshots/original-48px; the enlarged ones replace the files in
# assets/mugshots. Needs ffmpeg. From the project folder:
#   powershell -File tools/upscale-icons.ps1 [-ffmpeg path\to\ffmpeg.exe]

param([string]$ffmpeg = 'ffmpeg')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'assets\mugshots'
$keep = Join-Path $dir 'original-48px'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('mml-xbr-' + [guid]::NewGuid())
New-Item -ItemType Directory -Force $keep, $tmp | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
public static class IconPx {
  static int[] Read(Bitmap b) { var d = b.LockBits(new Rectangle(0, 0, b.Width, b.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb); var p = new int[b.Width * b.Height]; Marshal.Copy(d.Scan0, p, 0, p.Length); b.UnlockBits(d); return p; }
  static void Save(int[] p, int w, int h, string to) { using (var b = new Bitmap(w, h, PixelFormat.Format32bppArgb)) { var d = b.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb); Marshal.Copy(p, 0, d.Scan0, p.Length); b.UnlockBits(d); b.Save(to, ImageFormat.Png); } }
  // An opaque color image (see-through areas filled with the nearest real color,
  // so edges do not pick up black) and a gray image of the see-through mask.
  public static void Split(string src, string color, string alpha) {
    int w, h; int[] p; using (var b = new Bitmap(src)) { w = b.Width; h = b.Height; p = Read(b); }
    var a = new int[p.Length]; var c = (int[])p.Clone(); var filled = new bool[p.Length];
    for (int i = 0; i < p.Length; i++) { int al = (p[i] >> 24) & 255; a[i] = unchecked((int)0xFF000000) | (al << 16) | (al << 8) | al; filled[i] = al > 0; }
    for (int pass = 0; pass < 64; pass++) {
      var next = (bool[])filled.Clone(); bool any = false;
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * w + x; if (filled[i]) continue;
        int r = 0, g = 0, bl = 0, n = 0;
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
          int nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          int j = ny * w + nx; if (!filled[j]) continue;
          r += (c[j] >> 16) & 255; g += (c[j] >> 8) & 255; bl += c[j] & 255; n++;
        }
        if (n > 0) { c[i] = (r / n << 16) | (g / n << 8) | (bl / n); next[i] = true; any = true; }
      }
      filled = next; if (!any) break;
    }
    for (int i = 0; i < c.Length; i++) c[i] = unchecked((int)0xFF000000) | (c[i] & 0xFFFFFF);
    Save(c, w, h, color); Save(a, w, h, alpha);
  }
  public static void Merge(string color, string alpha, string to) {
    int w, h; int[] c, a;
    using (var b = new Bitmap(color)) { w = b.Width; h = b.Height; c = Read(b); }
    using (var b = new Bitmap(alpha)) { a = Read(b); }
    for (int i = 0; i < c.Length; i++) c[i] = (((a[i] >> 16) & 255) << 24) | (c[i] & 0xFFFFFF);
    Save(c, w, h, to);
  }
}
'@

$done = 0
try {
  foreach ($f in Get-ChildItem -LiteralPath $dir -File -Filter '*.png') {
    $orig = Join-Path $keep $f.Name
    # Always work from the kept original, so running this twice does not enlarge twice.
    if (-not (Test-Path -LiteralPath $orig)) {
      $img = [System.Drawing.Image]::FromFile($f.FullName); $small = $img.Width -le 64; $img.Dispose()
      if (-not $small) { continue }   # Mii pictures and the stand-in are left alone
      Copy-Item -LiteralPath $f.FullName -Destination $orig
    }
    $base = Join-Path $tmp $f.BaseName
    [IconPx]::Split($orig, "$base-c.png", "$base-a.png")
    foreach ($part in 'c', 'a') {
      & $ffmpeg -hide_banner -loglevel error -y -i "$base-$part.png" -vf 'format=rgba,xbr=4' -pix_fmt rgba "$base-$part-4x.png"
      if ($LASTEXITCODE) { throw "ffmpeg failed on $($f.Name)" }
    }
    [IconPx]::Merge("$base-c-4x.png", "$base-a-4x.png", $f.FullName)
    $done++
  }
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -Confirm:$false
}
"Enlarged $done character icons with xBR (4x)."
