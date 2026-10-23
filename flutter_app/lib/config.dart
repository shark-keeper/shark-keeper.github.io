import 'dart:ui' show Color;

import 'package:flutter/foundation.dart' show kReleaseMode;

/// 앱이 띄우는 게임 주소. 게임은 웹(GitHub Pages)에서 업데이트되므로
/// 밸런스·디자인 변경은 앱을 다시 배포하지 않아도 반영된다.
/// `source=app`으로 웹 쪽에서 앱 실행인지 구분할 수 있다.
const kGameUrl = 'https://shark-keeper.github.io/?source=app';
const kGameHost = 'shark-keeper.github.io';

/// 브랜드명(가칭). 바꿀 때는 tool/setup.dart의 kDisplayName도 같이 바꾼다.
const kAppTitle = '상어집사';

/// AdMob 보상형 광고 단위 ID
/// - 내 광고 단위(AdMob 콘솔 → 앱 → 광고 단위 → 보상형)를 만들면 아래 두 값에 넣는다. 비어 있으면 테스트 광고.
/// - **디버그·프로필 빌드는 항상 구글 테스트 광고**를 쓴다. 개발 중에 내 실제 광고를 보거나 누르면
///   AdMob 정책 위반(무효 트래픽)으로 계정이 정지될 수 있기 때문. 실제 광고는 릴리스 빌드(스토어 배포본)에서만.
/// - 실제 광고 단위를 넣고 서버 측 검증 URL을 설정한 뒤 서버 wrangler.jsonc의 ADS_MODE를 "ssv"로 바꾼다
///   (ssv 모드에서는 테스트 광고가 서버 콜백을 보내지 않으므로 디버그 빌드에서는 보상이 지급되지 않는다).
/// - 앱 ID는 tool/setup.dart(AndroidManifest.xml·Info.plist에 들어감).
const kMyRewardedUnitAndroid = 'ca-app-pub-3934873497580609/1177156695';
const kMyRewardedUnitIos = 'ca-app-pub-3934873497580609/1368814106';

const _testRewardedUnitAndroid = 'ca-app-pub-3940256099942544/5224354917';   // 구글 공개 테스트 ID
const _testRewardedUnitIos = 'ca-app-pub-3940256099942544/1712485313';
String get kRewardedUnitAndroid =>
    kReleaseMode && kMyRewardedUnitAndroid.isNotEmpty ? kMyRewardedUnitAndroid : _testRewardedUnitAndroid;
String get kRewardedUnitIos =>
    kReleaseMode && kMyRewardedUnitIos.isNotEmpty ? kMyRewardedUnitIos : _testRewardedUnitIos;

/// 하단 배너 광고 단위(AdMob 콘솔 → 광고 단위 → 배너). 규칙은 위 보상형과 같다(비어 있거나 디버그 빌드면 테스트 광고).
const kMyBannerUnitAndroid = '';
const kMyBannerUnitIos = '';

const _testBannerUnitAndroid = 'ca-app-pub-3940256099942544/6300978111';   // 구글 공개 테스트 ID
const _testBannerUnitIos = 'ca-app-pub-3940256099942544/2934735716';
String get kBannerUnitAndroid =>
    kReleaseMode && kMyBannerUnitAndroid.isNotEmpty ? kMyBannerUnitAndroid : _testBannerUnitAndroid;
String get kBannerUnitIos =>
    kReleaseMode && kMyBannerUnitIos.isNotEmpty ? kMyBannerUnitIos : _testBannerUnitIos;

const kPageColor = Color(0xFFE7F6FD);
const kSeaColor = Color(0xFF1B8FD6);
const kInkColor = Color(0xFF0D3557);

/// 앱 안(WebView)에서 열어도 되는 주소인지. 나머지는 기기 브라우저로 넘긴다.
bool isInAppUrl(Uri uri) {
  if (uri.scheme == 'about' || uri.scheme == 'data' || uri.scheme == 'blob') return true;
  return (uri.scheme == 'https' || uri.scheme == 'http') && uri.host == kGameHost;
}
