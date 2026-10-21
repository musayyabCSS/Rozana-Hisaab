import numpy as np
from PIL import Image
import os

source_path = "splash.png" if os.path.exists("splash.png") else "assets/splash.png"
img = Image.open(source_path).convert("RGBA")
arr = np.array(img)

# Detect artwork bounding box (excluding solid #0B101D background)
bg_color = np.array([11, 16, 29], dtype=np.int32)
diff = np.abs(arr[..., :3].astype(np.int32) - bg_color).sum(axis=-1)
ys, xs = np.where(diff > 25)
if xs.size == 0 or ys.size == 0:
    raise ValueError(f"No artwork found in splash source: {source_path}")
artwork = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

# Scale artwork to exactly 1180 px width (~43% of canvas)
target_w = 1180
scale = target_w / artwork.width
target_h = round(artwork.height * scale)
resized_art = artwork.resize((target_w, target_h), Image.LANCZOS)

# Place dead-center on 2732 x 2732 canvas
canvas = Image.new("RGBA", (2732, 2732), (11, 16, 29, 255))
canvas.paste(resized_art, ((2732 - target_w) // 2, (2732 - target_h) // 2), resized_art)
canvas.convert("RGB").save("assets/splash.png", "PNG", optimize=True)
print("assets/splash.png successfully rebalanced to 1180 px center width.")
