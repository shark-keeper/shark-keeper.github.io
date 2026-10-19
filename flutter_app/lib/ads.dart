import 'dart:async';
import 'dart:io' show Platform;

import 'package:google_mobile_ads/google_mobile_ads.dart';

import 'config.dart';

/// 보상형 광고 결과. 웹 게임에 그대로 JSON으로 돌려준다.
class AdResult {
  const AdResult(this.status, [this.message = '']);

  /// earned: 끝까지 봐서 보상 받음 / dismissed: 보상 전에 닫음 / failed: 불러오기·재생 실패 / busy: 이미 재생 중
  final String status;
  final String message;

  Map<String, dynamic> toJson() => {'status': status, 'message': message};
}

/// AdMob 보상형 광고 (google_mobile_ads)
/// - 앱 시작 때 동의(UMP) 확인 → SDK 초기화 → 광고 1개를 미리 불러 둔다.
/// - 보상은 서버 측 검증(SSV)으로 지급한다: userId(플레이어 ID)·customData(요청 ID)를 광고에 실어 보내면
///   광고를 끝까지 본 뒤 AdMob 서버가 우리 서버(/api/admob/ssv)로 직접 알려 준다.
///   ※ 구글 테스트 광고 단위는 SSV 콜백을 보내지 않으므로, 테스트 중에는 서버 ADS_MODE=test로 앱 보고를 인정한다.
class AdsService {
  AdsService._();
  static final AdsService instance = AdsService._();

  RewardedAd? _ready;
  bool _loading = false;
  bool _showing = false;
  bool _initialized = false;

  String get _unitId => Platform.isIOS ? kRewardedUnitIos : kRewardedUnitAndroid;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    await _requestConsent();
    await MobileAds.instance.initialize();
    _preload();
  }

  /// 유럽 등 동의가 필요한 지역이면 동의 창을 띄운다(그 외 지역은 아무것도 뜨지 않음).
  Future<void> _requestConsent() {
    final done = Completer<void>();
    ConsentInformation.instance.requestConsentInfoUpdate(
      ConsentRequestParameters(),
      () => ConsentForm.loadAndShowConsentFormIfRequired((_) {
        if (!done.isCompleted) done.complete();
      }),
      (_) {
        if (!done.isCompleted) done.complete();
      },
    );
    return done.future.timeout(const Duration(seconds: 8), onTimeout: () {});
  }

  void _preload() {
    if (_ready != null || _loading) return;
    _loading = true;
    RewardedAd.load(
      adUnitId: _unitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (ad) {
          _loading = false;
          _ready = ad;
        },
        onAdFailedToLoad: (_) {
          _loading = false;
        },
      ),
    );
  }

  Future<RewardedAd?> _getAd() async {
    if (_ready != null) return _ready;
    _preload();
    // 미리 불러 둔 광고가 없으면 최대 10초 기다린다
    for (var i = 0; i < 40 && _ready == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (i == 20 && !_loading && _ready == null) _preload(); // 실패했으면 5초 지점에 한 번만 다시 시도
    }
    return _ready;
  }

  Future<AdResult> showRewarded({String? userId, String? customData}) async {
    if (_showing) return const AdResult('busy', '광고가 이미 재생 중이에요');
    if (!_initialized) await init();
    _showing = true;
    try {
      final ad = await _getAd();
      if (ad == null) return const AdResult('failed', '광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요');
      _ready = null;
      if ((userId ?? '').isNotEmpty || (customData ?? '').isNotEmpty) {
        await ad.setServerSideOptions(ServerSideVerificationOptions(userId: userId, customData: customData));
      }
      final result = Completer<AdResult>();
      var earned = false;
      ad.fullScreenContentCallback = FullScreenContentCallback(
        onAdDismissedFullScreenContent: (a) {
          a.dispose();
          if (!result.isCompleted) result.complete(earned ? const AdResult('earned') : const AdResult('dismissed', '광고를 끝까지 보면 먹이를 받아요'));
        },
        onAdFailedToShowFullScreenContent: (a, err) {
          a.dispose();
          if (!result.isCompleted) result.complete(AdResult('failed', '광고를 재생하지 못했어요 (${err.code})'));
        },
      );
      await ad.show(onUserEarnedReward: (_, __) => earned = true);
      return await result.future;
    } finally {
      _showing = false;
      _preload(); // 다음 광고를 미리 불러 둔다
    }
  }
}
