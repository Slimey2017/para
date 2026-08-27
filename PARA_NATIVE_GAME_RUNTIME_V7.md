# PARA Native Game Runtime v7

Fixes ParaStore WEB game launching and downloads.

## Root cause
Developer build objects are stored in Supabase Storage under:

`developers/<developer>/projects/<project>/builds/<build>/files/<path>`

Published catalog `download_reference` values may point to a virtual entry path without the physical `files/` segment. PARA previously appended `index.html` directly to the build directory, causing published PARA games to fail while ordinary Windows apps still launched normally.

## Fix
- Normalizes published build storage prefixes to `/files/`.
- Applies the same normalization to live WEB runtime content and ZIP downloads.
- Supports catalog references that already include `/files/` without duplicating it.
