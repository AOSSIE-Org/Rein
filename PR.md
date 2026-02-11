# Replace Default Images with Custom Rein Branding

## Description
This PR removes unused default TanStack framework images and replaces generic PWA icons with custom Rein-branded icons.

## Changes Made
- ❌ Removed `tanstack-word-logo-white.svg` (unused, 15 KB)
- ❌ Removed `tanstack-circle-logo.png` (unused, 265 KB)
- ✅ Added `icon.svg` - Custom Rein icon with trackpad/remote control theme (352 bytes)
- ✅ Replaced `favicon.ico` with custom branding (4.2 KB)
- ✅ Replaced `logo192.png` with custom branding (8.4 KB)
- ✅ Replaced `logo512.png` with custom branding (45 KB)

## Benefits
- ✨ Proper app branding that matches Rein's remote control functionality
- 📦 Reduced public folder size (~280 KB removed)
- 🎨 Professional appearance when installed as PWA
- 🧹 Cleaner repository without unused framework images

## Testing
- [x] App runs without errors
- [x] Favicon displays correctly in browser
- [x] PWA manifest references correct icons
- [x] Icons display properly when installed on mobile

## Screenshots
(Add screenshots if needed)

## Related Issue
Closes #[issue_number]
