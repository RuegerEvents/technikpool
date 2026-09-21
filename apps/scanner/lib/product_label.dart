/// What a product is called in full: "Shure SM58", or just "Kaltgerätekabel"
/// for one nobody makes in particular, which the server sends without a
/// manufacturer. The web joins them the same way — `apps/web/src/lib/product-label.ts`.
String productLabel(String? manufacturerName, String name) =>
    manufacturerName == null ? name : '$manufacturerName $name';
