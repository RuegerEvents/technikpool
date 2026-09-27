/// What a product is called in full: "Shure SM58", or just "Kaltgerätekabel"
/// for one nobody makes in particular, which the server sends without a
/// manufacturer. The web joins them the same way — `apps/web/src/lib/product-label.ts`.
String productLabel(String? manufacturerName, String name) =>
    manufacturerName == null ? name : '$manufacturerName $name';

/// A product named with its caption: "Yamaha CL5 — FOH-Pult". The caption
/// explains the name rather than replacing it. Same as `withCaption` on the web.
String withCaption(String name, String? caption) =>
    caption == null || caption.isEmpty ? name : '$name — $caption';
