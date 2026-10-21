# 상어집사 — Flutter 앱 (WebView 래퍼)

배포 중인 웹게임 <https://shark-keeper.github.io/> 을 앱 화면에 띄우는 Flutter 프로젝트입니다.
게임 자체는 웹에서 업데이트되므로 **밸런스·디자인 변경은 앱을 다시 내지 않아도 바로 반영**됩니다.
앱을 다시 빌드해야 하는 경우는 앱 이름·아이콘·스플래시·이 폴더의 코드를 바꿀 때뿐입니다.

## 처음 설정 (한 번만)

필요: Flutter 3.38.1 이상(알림 패키지 요구, 첫 빌드는 3.47.7에서 확인), Android Studio(안드로이드), Xcode가 있는 Mac(iOS)

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

## 돌봄 알림 (기기 안 예약 알림, 2026-10-21)

- 서버 푸시(Firebase)가 아니라 **기기에서 예약하는 알림**(`flutter_local_notifications`, `lib/notifications.dart`).
- 웹 게임이 지금 상태로 앞으로 48시간을 미리 정산해 "배고파짐(배부름 25 미만)·똥 3개·병 걸림·병 사망 3시간 전·굶주림 사망 3시간 전" 시각을 계산하고, `SharkAds` 통로로 `{"type":"notify","items":[{id, at, title, body}]}`를 보낸다. 앱은 받을 때마다 예약(id 1~20)을 통째로 바꾸고, 권한 상태를 `window.__sharkNotifyState({granted})`로 돌려준다.
- 밤 10시~아침 8시에는 급하지 않은 알림(배고픔·똥)을 아침 8시로 미룬다. 병·사망 위험 알림은 바로 온다.
- 권한은 상어를 입양해 첫 알림을 예약할 때 묻는다(안드로이드 13+·iOS). 게임 기록 탭에서 켜고 끌 수 있다.
- 안드로이드 설정: `AndroidManifest.xml`에 `RECEIVE_BOOT_COMPLETED`와 리시버 2개, `build.gradle.kts`에 코어 라이브러리 디슈가링, 알림 아이콘 `res/drawable-*/ic_stat_shark.png`(도트 상어 흰색 실루엣, `res/raw/keep.xml`로 보존). 정확한 시각 알람 권한 없이 `inexactAllowWhileIdle`(몇 분 늦을 수 있음).
- iOS: `AppDelegate.swift`에서 `UNUserNotificationCenter` 델리게이트 등록(앱을 보고 있을 때도 표시).
- 시험: 디버그 빌드에서 PC 크롬 `chrome://inspect`로 앱 WebView에 붙어 콘솔에서 `planNotify()`를 실행하면 예약될 시각·문구를 볼 수 있다. 바로 떠 보려면 콘솔에서 `SharkAds.postMessage(JSON.stringify({type:'notify',items:[{id:1,at:Date.now()+90e3,title:'시험',body:'1분 반 뒤 알림'}]}))`을 보내고 앱을 내린다(정확한 시각 방식이 아니라 몇 분 늦을 수 있음).

### 알아둘 점

- 상어는 서버에 저장되고, 기기에는 게스트 토큰만 있다. **앱을 지우면 토큰이 사라져 그 상어를 이어서 키울 수 없다**(계정 연동 전까지).
- 브라우저(`?source=app`)와 앱은 서로 다른 게스트라 상어도 따로다.

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
