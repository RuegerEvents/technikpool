import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/widgets/product_thumb.dart';

/// A kit's picture is an SVG the server composes; a product's is a photo.
/// The thumbnail draws both, and an SVG's query string does not hide it.
void main() {
  test('an SVG is told by its path, not its query string', () {
    expect(isSvgUrl('http://s3/product-images/bundles/astb_1.svg'), isTrue);
    expect(isSvgUrl('http://s3/product-images/bundles/astb_1.SVG?v=12'), isTrue);
    expect(isSvgUrl('http://s3/product-images/prd_1.webp'), isFalse);
    expect(isSvgUrl('http://s3/x.webp?name=a.svg'), isFalse);
  });

  testWidgets('an SVG goes to the SVG renderer, a photo to Image', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Row(
          children: [
            ProductThumb(url: 'http://s3/bundles/astb_1.svg?v=12'),
            ProductThumb(url: 'http://s3/prd_1.webp'),
          ],
        ),
      ),
    );
    expect(find.byType(SvgPicture), findsOneWidget);
    expect(find.byType(Image), findsOneWidget);
  });
}
