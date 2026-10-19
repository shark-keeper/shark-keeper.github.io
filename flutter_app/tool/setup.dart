// 처음 한 번 실행: dart run tool/setup.dart
// android/ios 플랫폼 폴더를 만들고 앱 이름·인터넷 권한·아이콘·스플래시를 설정한다.
// 다시 실행해도 안전하다(이미 있는 파일은 flutter create가 덮어쓰지 않는다).
import 'dart:io';

const kOrg = 'io.github'; // → 앱 ID: io.github.sharkkeeper (스토어 출시 후에는 바꿀 수 없음)
const kProjectName = 'sharkkeeper';   // 밑줄 없이: iOS 번들 ID와 안드로이드 앱 ID가 똑같이 io.github.sharkkeeper가 된다
const kDisplayName = '부캉이'; // 홈 화면 아이콘 아래 표시되는 이름

// AdMob 앱 ID — 지금은 구글 공개 **테스트 앱 ID**. AdMob 가입 후 내 앱 ID로 바꾸고 이 스크립트를 다시 실행한다.
// (광고 단위 ID는 lib/config.dart의 kRewardedUnitAndroid / kRewardedUnitIos)
const kAdmobAppIdAndroid = 'ca-app-pub-3940256099942544~3347511713';
const kAdmobAppIdIos = 'ca-app-pub-3940256099942544~1458002511';

Future<void> run(String cmd, List<String> args) async {
  stdout.writeln('\n▶ $cmd ${args.join(' ')}');
  final p = await Process.start(cmd, args, runInShell: true, mode: ProcessStartMode.inheritStdio);
  final code = await p.exitCode;
  if (code != 0) {
    stderr.writeln('✖ 실패 (exit $code): $cmd ${args.join(' ')}');
    exit(code);
  }
}

void patch(String path, String Function(String) edit, String what) {
  final f = File(path);
  if (!f.existsSync()) {
    stderr.writeln('✖ $path 가 없어요');
    exit(1);
  }
  final before = f.readAsStringSync();
  final after = edit(before);
  if (after != before) f.writeAsStringSync(after);
  stdout.writeln('✔ $what${after == before ? ' (이미 적용됨)' : ''}');
}

Future<void> main() async {
  await run('flutter', [
    'create',
    '--org', kOrg,
    '--project-name', kProjectName,
    '--platforms', 'android,ios',
    '.',
  ]);

  // flutter create가 만드는 기본 카운터 앱 테스트는 이 앱에 맞지 않아 지운다
  final sample = File('test/widget_test.dart');
  if (sample.existsSync() && sample.readAsStringSync().contains('MyApp')) {
    sample.deleteSync();
    stdout.writeln('✔ 기본 예제 테스트 삭제');
  }

  patch('android/app/src/main/AndroidManifest.xml', (s) {
    s = s.replaceFirst(RegExp(r'android:label="[^"]*"'), 'android:label="$kDisplayName"');
    // 릴리스 빌드에는 인터넷 권한이 기본으로 들어가 있지 않다
    if (!s.contains('android.permission.INTERNET')) {
      s = s.replaceFirst('<application',
          '<uses-permission android:name="android.permission.INTERNET"/>\n    <application');
    }
    // AdMob 앱 ID (있으면 값만 바꾼다)
    final meta = RegExp(r'<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s+android:value="[^"]*"\s*/>');
    final tag = '<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="$kAdmobAppIdAndroid"/>';
    if (meta.hasMatch(s)) {
      s = s.replaceFirst(meta, tag);
    } else {
      s = s.replaceFirstMapped(RegExp(r'<application[^>]*>'), (m) => '${m[0]}\n        $tag');
    }
    return s;
  }, 'Android 앱 이름·인터넷 권한·AdMob 앱 ID');

  // google_mobile_ads는 안드로이드 6.0(API 23) 이상이 필요하다
  for (final path in ['android/app/build.gradle.kts', 'android/app/build.gradle']) {
    if (!File(path).existsSync()) continue;
    patch(path, (s) => s
        .replaceAll('minSdk = flutter.minSdkVersion', 'minSdk = maxOf(flutter.minSdkVersion, 23)')
        .replaceAll('minSdkVersion flutter.minSdkVersion', 'minSdkVersion Math.max(flutter.minSdkVersion, 23)'),
      'Android 최소 버전 API 23 이상');
  }

  patch('ios/Runner/Info.plist', (s) {
    return s.replaceFirstMapped(
        RegExp(r'(<key>CFBundleDisplayName</key>\s*<string>)[^<]*(</string>)'),
        (m) => '${m[1]}$kDisplayName${m[2]}');
  }, 'iOS 앱 이름');

  patch('ios/Runner/Info.plist', (s) {
    final idRe = RegExp(r'(<key>GADApplicationIdentifier</key>\s*<string>)[^<]*(</string>)');
    if (idRe.hasMatch(s)) return s.replaceFirstMapped(idRe, (m) => '${m[1]}$kAdmobAppIdIos${m[2]}');
    // 앱 ID + 구글 광고 네트워크 식별자(SKAdNetwork)
    return s.replaceFirst(RegExp(r'</dict>\s*</plist>\s*$'), '''\t<key>GADApplicationIdentifier</key>
\t<string>$kAdmobAppIdIos</string>
\t<key>SKAdNetworkItems</key>
\t<array>
\t\t<dict><key>SKAdNetworkIdentifier</key><string>cstr6suwn9.skadnetwork</string></dict>
\t</array>
</dict>
</plist>
''');
  }, 'iOS AdMob 앱 ID');

  await run('flutter', ['pub', 'get']);
  await run('dart', ['run', 'flutter_launcher_icons']);
  await run('dart', ['run', 'flutter_native_splash:create']);

  stdout.writeln('\n완료! 기기를 연결하고 `flutter run`으로 실행해 보세요.');
}
