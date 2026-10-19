# 상어집사 — Flutter 앱 (WebView 래퍼)

배포 중인 웹게임 <https://shark-keeper.github.io/> 을 앱 화면에 띄우는 Flutter 프로젝트입니다.
게임 자체는 웹에서 업데이트되므로 **밸런스·디자인 변경은 앱을 다시 내지 않아도 바로 반영**됩니다.
앱을 다시 빌드해야 하는 경우는 앱 이름·아이콘·스플래시·이 폴더의 코드를 바꿀 때뿐입니다.

## 처음 설정 (한 번만)

필요: Flutter 3.24 이상, Android Studio(안드로이드), Xcode가 있는 Mac(iOS)

```bash
cd flutter_app
dart run tool/setup.dart
```

이 스크립트가 하는 일:

1. `flutter create`로 `android/`, `ios/` 폴더 생성 (앱 ID `io.github.sharkkeeper`)
2. 앱 이름을 `상어집사`로 설정, 안드로이드 릴리스 빌드에 인터넷 권한 추가
3. 앱 아이콘(`flutter_launcher_icons`), 스플래시(`flutter_native_splash`) 생성

생성된 `android/`, `ios/` 폴더는 커밋해 두세요.

## 실행

```bash
flutter run          # 연결된 기기·에뮬레이터에서 실행
flutter test         # 링크 처리 규칙 테스트
```

## 앱 동작

| 항목 | 동작 |
|---|---|
| 게임 화면 | `https://shark-keeper.github.io/?source=app` 을 WebView로 표시 (세로 고정, 확대 끔) |
| 외부 링크 | 게임 주소 밖 링크는 기기 브라우저로 연다 |
| 뒤로가기 (안드로이드) | 웹 안에서 뒤로 갈 곳이 없으면 앱 종료 |
| 첫 로딩 | 상어 그림 + 진행 막대 |
| 오프라인 | 한 번 접속한 뒤에는 웹의 서비스 워커 캐시로 열린다. 캐시도 없으면 "다시 시도" 화면 |
| 앱 복귀 | 웹이 `visibilitychange`에서 지난 시간을 바로 정산 |

## 광고 (AdMob 보상형)

- `lib/ads.dart`가 보상형 광고를 재생한다. 웹 게임이 `SharkAds` 통로로 요청하면 광고를 띄우고 결과를 웹에 돌려준다.
- **지금은 구글 공개 테스트 ID**라 실제 수익 없이 "Test Ad" 광고가 나온다. 바꾸는 곳: 광고 단위 `lib/config.dart`, 앱 ID `tool/setup.dart`(바꾼 뒤 `dart run tool/setup.dart` 다시 실행).
- 실제 ID로 바꿀 때 체크리스트는 저장소 루트 `CLAUDE.md`의 "광고" 절 참고(서버 검증 URL, `ADS_MODE`, `app-ads.txt`, 스토어 연결).

### 알아둘 점

- **저장 데이터는 앱과 브라우저가 따로**입니다. 지금 게임은 기기 localStorage에 저장하므로,
  브라우저에서 키우던 상어는 앱에 보이지 않습니다. 서버 저장(계정)이 생기면 해결됩니다.
- 앱을 지우면 앱 안의 상어 기록도 함께 지워집니다.

## 스토어 배포

### Google Play

1. 업로드 키 생성과 서명 설정: <https://docs.flutter.dev/deployment/android#sign-the-app>
   (`android/key.properties`, `*.jks`는 `.gitignore`에 들어 있음 — **공개 저장소에 올리지 말 것**)
2. `pubspec.yaml`의 `version` 확인 후 `flutter build appbundle`
3. `build/app/outputs/bundle/release/app-release.aab` 를 Play Console에 업로드

### App Store

1. Mac에서 `ios/Runner.xcworkspace`를 Xcode로 열어 Team·Bundle ID 설정
2. `flutter build ipa` 후 Transporter 또는 Xcode Organizer로 업로드

> iOS는 웹사이트를 감싸기만 한 앱을 심사 지침 4.2(최소 기능)로 반려하는 경우가 많습니다.
> 앱 전용 기능(푸시 알림으로 "배고파요" 알림, 홈 위젯 등)을 붙이면 통과 가능성이 높아집니다.

## 바꿀 곳

| 바꾸고 싶은 것 | 파일 |
|---|---|
| 게임 주소·브랜드명·색 | `lib/config.dart` |
| 홈 화면 표시 이름 | `tool/setup.dart`의 `kDisplayName` 수정 후 다시 실행 |
| 아이콘·스플래시 | `assets/icon/*.png` 교체 후 `dart run flutter_launcher_icons`, `dart run flutter_native_splash:create` |
