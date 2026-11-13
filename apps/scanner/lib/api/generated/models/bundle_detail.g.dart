// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bundle_detail.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BundleDetail _$BundleDetailFromJson(Map<String, dynamic> json) => BundleDetail(
  id: json['id'] as String,
  name: json['name'] as String,
  caption: json['caption'] as String?,
  tag: json['tag'] as String?,
  imageUrl: json['imageUrl'] as String?,
  categoryName: json['categoryName'] as String,
  organizationId: json['organizationId'] as String,
  location: json['location'] == null
      ? null
      : LocationRef.fromJson(json['location'] as Map<String, dynamic>),
  unitCount: (json['unitCount'] as num).toInt(),
  parentBundle: json['parentBundle'] == null
      ? null
      : KitRef.fromJson(json['parentBundle'] as Map<String, dynamic>),
  units: (json['units'] as List<dynamic>)
      .map((e) => BundleUnit.fromJson(e as Map<String, dynamic>))
      .toList(),
  innerBundles: (json['innerBundles'] as List<dynamic>)
      .map((e) => InnerBundle.fromJson(e as Map<String, dynamic>))
      .toList(),
  canEdit: json['canEdit'] as bool,
  caseUnitId: json['caseUnitId'] as String?,
  number: json['number'] as String?,
  numberFromCase: json['numberFromCase'] as bool?,
  extraCases: (json['extraCases'] as num?)?.toInt(),
);

Map<String, dynamic> _$BundleDetailToJson(BundleDetail instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'caption': ?instance.caption,
      'tag': ?instance.tag,
      'imageUrl': ?instance.imageUrl,
      'categoryName': instance.categoryName,
      'organizationId': instance.organizationId,
      'location': ?instance.location,
      'unitCount': instance.unitCount,
      'parentBundle': ?instance.parentBundle,
      'units': instance.units,
      'innerBundles': instance.innerBundles,
      'canEdit': instance.canEdit,
      'caseUnitId': ?instance.caseUnitId,
      'number': ?instance.number,
      'numberFromCase': ?instance.numberFromCase,
      'extraCases': ?instance.extraCases,
    };
