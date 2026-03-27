# Changelog

## 0.3.0 - 2026-03-27

### Added
- Declarative chat command API via `scrollModifier`:
  - `{ id, type: 'prepend' }`
  - `{ id, type: 'append', behavior?, ifAtBottomOnly? }`
  - `{ id, type: 'items-change' }`
  - `{ id, type: 'jump-to-key', key, align?, behavior? }`
- Bottom-state hysteresis via `atBottomHysteresis` (`{ enter: 80, leave: 160 }` default).
- Logical anchor restore (`key + offsetWithinItem`) with fallback to scrollHeight delta.
- Scroll correction pipeline with frame-batched jump flush.
- `scrollToIndex`/`scrollToKey` reconciliation pass for dynamic-height lists.
- New test coverage for hysteresis and short-conversation `onStartReached`.

### Changed
- `findLastVisibleIndex` moved from linear scan to binary-search strategy.
- Initial bottom alignment settling now stops by stability condition (`delta < 1px` for 3 frames) with 500ms timeout.
- Chat integrations in `admin-front` now use declarative prepend commands instead of manual `prepareAnchor()`.

### Deprecated
- `prepareAnchor()` (still available for one transition cycle).
- `scrollToMessageKey` and `onScrollToMessageComplete` (use `scrollModifier` command IDs).

### Notes
- Public docs updated with migration guide and corrected defaults (`ChatVirtualList overscan=20`, `VirtualList estimatedItemSize=60`, `VirtualList overscan=20`).
