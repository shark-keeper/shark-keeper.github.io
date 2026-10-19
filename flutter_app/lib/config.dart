import 'dart:ui' show Color;

/// 앱이 띄우는 게임 주소. 게임은 웹(GitHub Pages)에서 업데이트되므로
/// 밸런스·디자인 변경은 앱을 다시 배포하지 않아도 반영된다.
/// `source=app`으로 웹 쪽에서 앱 실행인지 구분할 수 있다.
const kGameUrl = 'https://shark-keeper.github.io/?source=app';
const kGameHost = 'shark-keeper.github.io';

/// 브랜드명(가칭). 바꿀 때는 tool/setup.dart의 kDisplayName도 같이 바꾼다.
const kAppTitle = '상어집사';

/// AdMob 보상형 광고 단위 ID — 지금은 구글이 공개한 **테스트 ID**(실제 수익 없음, 계정 없이 동작).
/// AdMob 가입 후 내 광고 단위 ID로 바꾸고, tool/setup.dart의 앱 ID도 함께 바꾼다.
/// 실제 ID로 바꾼 뒤에는 서버 wrangler.jsonc의 ADS_MODE를 "ssv"로 바꿔 서버 검증으로만 보상을 준다.
const kRewardedUnitAndroid = 'ca-app-pub-3940256099942544/5224354917';
const kRewardedUnitIos = 'ca-app-pub-3940256099942544/1712485313';

const kPageColor = Color(0xFFE7F6FD);
const kSeaColor = Color(0xFF1B8FD6);
const kInkColor = Color(0xFF0D3557);

/// 앱 안(WebView)에서 열어도 되는 주소인지. 나머지는 기기 브라우저로 넘긴다.
bool isInAppUrl(Uri uri) {
  if (uri.scheme == 'about' || uri.scheme == 'data' || uri.scheme == 'blob') return true;
  return (uri.scheme == 'https' || uri.scheme == 'http') && uri.host == kGameHost;
}
