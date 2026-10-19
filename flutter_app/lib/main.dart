import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'ads.dart';
import 'config.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark, // Android: 어두운 아이콘
    statusBarBrightness: Brightness.light, // iOS: 밝은 배경 → 어두운 글자
    systemNavigationBarColor: Colors.white,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));
  runApp(const BukangApp());
  AdsService.instance.init(); // 동의 확인 → 광고 SDK 초기화 → 광고 미리 불러 두기
}

class BukangApp extends StatelessWidget {
  const BukangApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: kAppTitle,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: kSeaColor,
        scaffoldBackgroundColor: kPageColor,
      ),
      home: const GameScreen(),
    );
  }
}

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  late final WebViewController _web;
  int _progress = 0;
  bool _firstLoadDone = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kPageColor)
      ..enableZoom(false)
      // 웹 게임 ↔ 앱 광고 통로: 웹이 SharkAds.postMessage('{"type":"rewarded","reqId":…,"userId":…}')를 보내면
      // 앱이 보상형 광고를 재생하고 window.__sharkAdResult({status, message, reqId})로 결과를 돌려준다.
      ..addJavaScriptChannel('SharkAds', onMessageReceived: (m) => _onAdMessage(m.message))
      ..setNavigationDelegate(NavigationDelegate(
        onProgress: (p) {
          if (mounted) setState(() => _progress = p);
        },
        onPageFinished: (_) {
          if (mounted) setState(() => _firstLoadDone = true);
        },
        onWebResourceError: (err) {
          // 이미지·폰트 같은 하위 리소스 실패는 무시하고, 게임 화면 자체를 못 불러온 경우만 처리
          if (err.isForMainFrame ?? true) {
            if (mounted) setState(() => _failed = true);
          }
        },
        onNavigationRequest: (req) {
          final uri = Uri.tryParse(req.url);
          if (uri == null) return NavigationDecision.prevent;
          if (isInAppUrl(uri)) return NavigationDecision.navigate;
          // 게임 밖 링크(공유·안내 페이지 등)는 기기 브라우저로 연다
          launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
          return NavigationDecision.prevent;
        },
      ))
      ..loadRequest(Uri.parse(kGameUrl));
  }

  Future<void> _onAdMessage(String raw) async {
    Map<String, dynamic> msg;
    try {
      msg = jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    if (msg['type'] != 'rewarded') return;
    final reqId = '${msg['reqId'] ?? ''}';
    final r = await AdsService.instance.showRewarded(
      userId: msg['userId'] as String?,
      customData: reqId.isEmpty ? null : reqId,
    );
    final payload = jsonEncode({...r.toJson(), 'reqId': reqId});
    await _web.runJavaScript('window.__sharkAdResult && window.__sharkAdResult($payload)');
  }

  void _retry() {
    setState(() {
      _failed = false;
      _progress = 0;
    });
    _web.loadRequest(Uri.parse(kGameUrl));
  }

  Future<void> _handleBack() async {
    if (await _web.canGoBack()) {
      await _web.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            fit: StackFit.expand,
            children: [
              WebViewWidget(controller: _web),
              if (!_firstLoadDone && !_failed) _LoadingView(progress: _progress),
              if (_failed) _OfflineView(onRetry: _retry),
            ],
          ),
        ),
      ),
    );
  }
}

class _LoadingView extends StatelessWidget {
  const _LoadingView({required this.progress});
  final int progress;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: kPageColor,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset('assets/icon/splash.png', width: 200),
            const SizedBox(height: 24),
            SizedBox(
              width: 160,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(99),
                child: LinearProgressIndicator(
                  value: progress == 0 ? null : progress / 100,
                  minHeight: 6,
                  color: kSeaColor,
                  backgroundColor: const Color(0xFFD6ECF8),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OfflineView extends StatelessWidget {
  const _OfflineView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: kPageColor,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Opacity(opacity: .6, child: Image.asset('assets/icon/splash.png', width: 180)),
              const SizedBox(height: 20),
              const Text('바다에 연결할 수 없어요',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: kInkColor)),
              const SizedBox(height: 8),
              const Text('인터넷 연결을 확인하고 다시 시도해 주세요.\n한 번 접속한 뒤에는 오프라인에서도 열려요.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, height: 1.5, color: Color(0xFF4F7393))),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: onRetry,
                style: FilledButton.styleFrom(
                  backgroundColor: kInkColor,
                  minimumSize: const Size(160, 48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                child: const Text('다시 시도', style: TextStyle(fontSize: 16)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
