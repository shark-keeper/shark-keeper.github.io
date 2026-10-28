import 'package:sharkkeeper/config.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('게임 주소는 앱 안에서 연다', () {
    expect(isInAppUrl(Uri.parse(kGameUrl)), isTrue);
    expect(isInAppUrl(Uri.parse('https://shark-keeper.ohsangplay.com/manifest.json')), isTrue);
    expect(isInAppUrl(Uri.parse('https://shark-keeper.github.io/?source=app')), isTrue);   // 옛 주소 → 새 주소로 넘어가는 중
    expect(isInAppUrl(Uri.parse('about:blank')), isTrue);
  });

  test('외부 주소는 기기 브라우저로 넘긴다', () {
    expect(isInAppUrl(Uri.parse('https://fonts.googleapis.com/css2')), isFalse);
    expect(isInAppUrl(Uri.parse('https://example.com/')), isFalse);
    expect(isInAppUrl(Uri.parse('https://bukanggochi.github.io/')), isFalse);   // 예전 주소는 더 이상 게임이 아님
    expect(isInAppUrl(Uri.parse('https://evil.shark-keeper.github.io.example.com/')), isFalse);
    expect(isInAppUrl(Uri.parse('https://shark-keeper.ohsangplay.com.example.com/')), isFalse);
    expect(isInAppUrl(Uri.parse('https://ohsangplay.com/')), isFalse);
    expect(isInAppUrl(Uri.parse('intent://scan/#Intent;end')), isFalse);
  });
}
