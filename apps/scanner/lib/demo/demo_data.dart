import '../api/generated/export.dart';

/// The warehouse the store reviewers see.
///
/// Real enough to exercise every screen — two organizations so a cross-org
/// loan is visible, assets in three states, a production to book against — and
/// small enough that someone with no context can find their way around it in a
/// minute. Tags are sequential and printed all over the UI, because a reviewer
/// has no sticker to scan and has to type one.
class DemoData {
  DemoData._();

  static const _blue = '#1d4ed8';
  static const _amber = '#b45309';

  static const nordlicht = Organization(
    id: 'org_demo_nordlicht',
    name: 'Nordlicht Veranstaltungstechnik',
    shortName: 'Nordlicht',
    color: _blue,
    avatarLabel: 'NL',
  );

  static const buehnenwerk = Organization(
    id: 'org_demo_buehnenwerk',
    name: 'Bühnenwerk Hamburg',
    shortName: 'Bühnenwerk',
    color: _amber,
    avatarLabel: 'BW',
  );

  static const user = User(
    id: 'usr_demo',
    email: 'demo@technikpool.app',
    name: 'Demo',
    emailVerified: true,
  );

  static const currentUser = CurrentUser(
    user: user,
    isAdmin: false,
    organizations: [nordlicht, buehnenwerk],
  );

  static const categories = <Category>[
    Category(id: 'catg_demo_light', name: 'Licht', color: '#facc15', sortOrder: 1),
    Category(id: 'catg_demo_sound', name: 'Ton', color: '#38bdf8', sortOrder: 2),
    Category(id: 'catg_demo_rigging', name: 'Rigging', color: '#a3a3a3', sortOrder: 3),
  ];

  static const _warehouse = Address(
    id: 'addr_demo_warehouse',
    line1: 'Lagerstraße 7',
    postalCode: '22765',
    city: 'Hamburg',
  );

  static const _venue = Address(
    id: 'addr_demo_venue',
    line1: 'Große Freiheit 36',
    postalCode: '22767',
    city: 'Hamburg',
  );

  static const locations = <Location>[
    Location(
      id: 'loc_demo_warehouse',
      name: 'Lager Hamburg',
      organization: nordlicht,
      address: _warehouse,
    ),
    Location(id: 'loc_demo_truck', name: 'LKW 1', organization: nordlicht, address: _warehouse),
    Location(
      id: 'loc_demo_venue',
      name: 'Halle Süd',
      organization: buehnenwerk,
      address: _venue,
    ),
  ];

  static final productions = <Production>[
    Production(
      id: 'prdn_demo_festival',
      name: 'Hafenfest Open Air',
      startDate: DateTime.now().subtract(const Duration(days: 1)),
      endDate: DateTime.now().add(const Duration(days: 3)),
      organization: nordlicht,
    ),
    Production(
      id: 'prdn_demo_theatre',
      name: 'Theaterpremiere Elbufer',
      startDate: DateTime.now().add(const Duration(days: 12)),
      endDate: DateTime.now().add(const Duration(days: 15)),
      organization: buehnenwerk,
    ),
  ];

  static const _movingHead = Product(
    id: 'prd_demo_mh',
    name: 'MAC Aura XB',
    manufacturerName: 'Martin',
    category: Category(id: 'catg_demo_light', name: 'Licht', color: '#facc15', sortOrder: 1),
  );

  static const _par = Product(
    id: 'prd_demo_par',
    name: 'ColorSource PAR',
    manufacturerName: 'ETC',
    category: Category(id: 'catg_demo_light', name: 'Licht', color: '#facc15', sortOrder: 1),
  );

  static const _speaker = Product(
    id: 'prd_demo_speaker',
    name: 'K2',
    manufacturerName: 'L-Acoustics',
    category: Category(id: 'catg_demo_sound', name: 'Ton', color: '#38bdf8', sortOrder: 2),
  );

  static const _mixer = Product(
    id: 'prd_demo_mixer',
    name: 'CL5',
    manufacturerName: 'Yamaha',
    category: Category(id: 'catg_demo_sound', name: 'Ton', color: '#38bdf8', sortOrder: 2),
  );

  static const _hoist = Product(
    id: 'prd_demo_hoist',
    name: 'BGV-D8 1t',
    manufacturerName: 'Chainmaster',
    category: Category(id: 'catg_demo_rigging', name: 'Rigging', color: '#a3a3a3', sortOrder: 3),
  );

  /// Tags run 40000001 upwards — the same shape the sticker printer produces,
  /// so a reviewer typing one is doing exactly what an operator scans.
  static List<Asset> assets() => [
    _asset('40000001', _movingHead, 0, AssetStatus.available, 'MAC-0041'),
    _asset('40000002', _movingHead, 0, AssetStatus.available, 'MAC-0042'),
    _asset('40000003', _movingHead, 1, AssetStatus.available, 'MAC-0043'),
    _asset('40000004', _par, 0, AssetStatus.available, 'CS-1180'),
    _asset('40000005', _par, 0, AssetStatus.maintenance, 'CS-1181'),
    _asset('40000006', _speaker, 0, AssetStatus.available, 'K2-7712'),
    _asset('40000007', _speaker, 1, AssetStatus.available, 'K2-7713'),
    _asset('40000008', _mixer, 0, AssetStatus.available, 'CL5-0009'),
    _asset('40000009', _hoist, 0, AssetStatus.broken, 'CM-3301'),
    _asset('40000010', _hoist, 0, AssetStatus.available, 'CM-3302'),
    // Loaned in from the other organization, so the reviewer sees that assets
    // carry an owner and that it isn't always the one they are working for.
    _asset('40000011', _speaker, 2, AssetStatus.available, 'K2-9001', buehnenwerk),
    _asset('40000012', _mixer, 2, AssetStatus.available, 'CL5-9002', buehnenwerk),
  ];

  static Asset _asset(
    String tag,
    Product product,
    int locationIndex,
    AssetStatus status,
    String serial, [
    Organization owner = nordlicht,
  ]) => Asset(
    id: 'asset_demo_$tag',
    assetTag: tag,
    serialNumber: serial,
    status: status,
    product: product,
    location: locations[locationIndex],
    organization: owner,
  );
}
