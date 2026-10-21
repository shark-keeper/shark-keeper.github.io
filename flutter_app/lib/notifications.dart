import 'dart:io' show Platform;
import 'dart:ui' show Color;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// 웹 게임이 보내 준 예약 알림 한 건 (at = 알림 시각, 1970년부터 밀리초)
class NotifyItem {
  const NotifyItem(this.id, this.at, this.title, this.body);
  final int id;
  final int at;
  final String title;
  final String body;

  static NotifyItem? fromJson(Object? v) {
    if (v is! Map) return null;
    final id = v['id'], at = v['at'];
    if (id is! num || at is! num) return null;
    return NotifyItem(id.toInt(), at.toInt(), '${v['title'] ?? ''}', '${v['body'] ?? ''}');
  }
}

/// 기기 안 예약 알림 (서버 푸시 아님)
/// - 웹 게임이 "아무것도 안 하면 언제 배고파지고·똥이 쌓이고·아픈지" 계산해 목록을 보내면, 예약을 통째로 바꾼다.
/// - 게임 알림은 id 1~[maxId]만 쓴다. 이미 화면에 떠 있는 알림은 지우지 않는다(cancelAll을 쓰지 않는 이유).
/// - 시간은 절대 시각(UTC)으로 예약하므로 기기 시간대 설정과 상관없다.
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  static const maxId = 20;
  static const _channelId = 'care';

  final _plugin = FlutterLocalNotificationsPlugin();
  bool _ready = false;
  bool _askedAndroid = false;

  static const _details = NotificationDetails(
    android: AndroidNotificationDetails(
      _channelId,
      '돌봄 알림',
      channelDescription: '상어가 배고프거나 아플 때 알려 줘요',
      importance: Importance.high,
      priority: Priority.high,
      icon: 'ic_stat_shark',
      color: Color(0xFF2A9DE0),
    ),
    iOS: DarwinNotificationDetails(presentAlert: true, presentSound: true),
  );

  Future<void> init() async {
    if (_ready) return;
    tzdata.initializeTimeZones();
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_shark'),
        // 앱을 켜자마자 권한 창을 띄우지 않는다 — 첫 알림을 예약할 때(상어를 입양한 뒤) 묻는다
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
    );
    _ready = true;
  }

  /// 알림 권한 확인(필요하면 한 번만 요청). 허용돼 있으면 true
  Future<bool> ensurePermission() async {
    await init();
    if (Platform.isAndroid) {
      final a = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (a == null) return false;
      if (await a.areNotificationsEnabled() ?? false) return true;
      if (_askedAndroid) return false; // 거절했으면 매번 묻지 않는다
      _askedAndroid = true;
      return await a.requestNotificationsPermission() ?? false;
    }
    if (Platform.isIOS) {
      final i = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
      // 처음 한 번만 창이 뜨고, 그다음부터는 현재 허용 여부만 돌려준다
      return await i?.requestPermissions(alert: true, badge: false, sound: true) ?? false;
    }
    return false;
  }

  /// 예약을 [items]로 바꾼다. 반환값: 알림 권한이 있는지(목록이 비어 있으면 권한을 묻지 않고 null)
  Future<bool?> replaceSchedule(List<NotifyItem> items) async {
    await init();
    for (var id = 1; id <= maxId; id++) {
      await _plugin.cancel(id: id);
    }
    if (items.isEmpty) return null;
    if (!await ensurePermission()) return false;
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final it in items) {
      if (it.id < 1 || it.id > maxId || it.at <= now + 60 * 1000) continue;
      await _plugin.zonedSchedule(
        id: it.id,
        scheduledDate: tz.TZDateTime.fromMillisecondsSinceEpoch(tz.UTC, it.at),
        notificationDetails: _details,
        // 정확한 시각 알람 권한 없이 쓰는 방식(몇 분 늦을 수 있음) — 돌봄 알림에는 충분하다
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        title: it.title,
        body: it.body,
      );
    }
    return true;
  }
}
