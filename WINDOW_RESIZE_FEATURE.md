# Kiro Window Auto-Resize Feature

## Overview
The Kiro Electron window now automatically resizes to match 100% of the client screen size, even when the xpra client or display metrics change.

## Changes Made

### 1. Password Field Fix (`src/main/registration/browser-registrar.ts`)
Fixed the account creation bug where password fields were being skipped:
- Changed from re-querying password fields on each iteration (causing DOM race conditions)
- Now queries all password fields once and generates stable selectors
- Uses `typeInto()` for character-by-character typing (better React compatibility)
- Increased delays between fields (500-800ms) for proper React state updates

### 2. Window Auto-Resize (`src/main/index.ts`)
Added automatic window resizing functionality:

#### Features:
1. **Window Resize Handler** (lines 2051-2073)
   - Listens for window resize events
   - Debounces resize events (500ms) to avoid excessive calls
   - Automatically resizes window to match screen dimensions
   - Centers window after resize

2. **Display Metrics Change Handler** (lines 7449-7459)
   - Listens for display metrics changes (e.g., xpra client screen resize)
   - Automatically adjusts window size when screen dimensions change
   - Only triggers on primary display changes

3. **Initial Size Enforcement** (lines 2080-2084)
   - Ensures window starts at full screen size on startup
   - Sets window to 100% of work area size
   - Centers window

## How It Works

### For xpra Users:
When you resize your browser window (xpra HTML5 client):
1. The display metrics change event fires
2. Kiro detects the new screen size
3. Window automatically resizes to fill 100% of the new client area
4. Window is centered on screen

### For Regular Desktop Users:
If someone manually resizes the Kiro window:
1. The resize event fires with 500ms debounce
2. Window automatically snaps back to full screen size
3. Maintains 100% screen coverage

## Configuration

The window is created with these settings:
```typescript
{
  fullscreen: true,      // Start in fullscreen
  minWidth: 800,         // Minimum dimensions
  minHeight: 600,
  show: false,          // Don't show until ready
  autoHideMenuBar: true
}
```

## Testing

### Test with xpra:
1. Access Kiro via xpra HTML5 client
2. Resize your browser window
3. Kiro window should automatically fill the new size

### Test manually:
1. Start Kiro
2. Try resizing the window
3. Window should snap back to full screen after 500ms

## Logs

Monitor window resize activity:
```bash
journalctl -u kiro.service | grep "Window.*Resizing"
```

Or check the Electron console output for:
- `[Window] Resizing to match screen: WIDTHxHEIGHT`
- `[Window] Display metrics changed, resizing to: WIDTHxHEIGHT`

## Related Files
- `/root/kiro/src/main/index.ts` - Main process window management
- `/root/kiro/src/main/registration/browser-registrar.ts` - Password field fix
- `/root/kiro/start-kiro.sh` - xpra startup script

## Systemd Service
The systemd service remains unchanged:
```bash
systemctl status kiro.service
systemctl restart kiro.service
```
