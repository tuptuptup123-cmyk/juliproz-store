# Catalogue cover standard

The 2026-10-10 cover set uses a transparent 1200 × 1200 canvas, a centered product, and an 84% maximum product extent (8% minimum margins). The existing storefront supplies the card background. The manifest records every original cover, chosen source photograph, output URL, SHA-256 and byte size.

Only original photographs were used. Existing transparent cutouts were recentered; opaque photographs received U2NetP alpha masks using the same pinned model as Photo Studio, followed by visual review and manual mask corrections where packaging, floor, hands or interior gaps remained. Product RGB, markings, fabric, damage and geometry were retained before normal resampling and WebP compression. No generated product image was published. No horizontal mirroring was used.

For products 25, 30, 64, 183, 226 and 321, existing gallery photos provide a more suitable side view. Product 242 uses its existing front view with the packaging removed. Other footwear retains its real photographed angle when no suitable right-facing view exists; achieving an identical angle requires a new source photograph.

Publish assets before changing database references. Update a row only while its current `image_url` still matches `previous_url`; this prevents overwriting a cover changed during processing. Preserve the original cover and every existing gallery photo. The original URLs in the manifest allow reversal without deleting either asset set.

Validation: all 334 outputs decoded successfully, have the expected dimensions and alpha channel, and match manifest hashes. Contact sheets were reviewed across the whole set, and complex opaque photographs were reviewed separately against their sources. Source quality and cropped source framing remain limits; background removal cannot recreate fabric outside a photograph.
