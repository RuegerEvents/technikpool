import 'package:flutter_test/flutter_test.dart';
import 'package:technikpool_scanner/natural_sort.dart';

void main() {
  List<String> sorted(List<String> names) => [...names]..sort(naturalCompare);

  test('numbers compare by value, not character by character', () {
    expect(sorted(['Kabel 10m', 'Kabel 2m', 'Kabel 1,5m', 'Kabel 20m']), [
      'Kabel 1,5m',
      'Kabel 2m',
      'Kabel 10m',
      'Kabel 20m',
    ]);
    expect(sorted(['40000010', '40000002', '40000001']), ['40000001', '40000002', '40000010']);
  });

  test('case and umlauts do not split the alphabet', () {
    expect(sorted(['Zebra', 'Äpfel', 'a-10', 'A-2', 'B']), ['A-2', 'a-10', 'Äpfel', 'B', 'Zebra']);
  });

  test('matches the order the server returns', () {
    // What Postgres' "natural" collation produced for the same list.
    expect(
      sorted([
        'XLR 1,5m',
        'Zebra',
        'kabel 2m',
        '10m',
        'A-1',
        'Kabel 10m',
        'Äpfel',
        '2m',
        'a-10',
        'A-2',
      ]),
      ['2m', '10m', 'A-1', 'A-2', 'a-10', 'Äpfel', 'kabel 2m', 'Kabel 10m', 'XLR 1,5m', 'Zebra'],
    );
  });

  test('numbers longer than an int still order', () {
    expect(naturalCompare('9' * 30, '1${'0' * 30}'), lessThan(0));
    expect(naturalCompare('007', '7'), isNot(0));
  });
}
