package com.calcchat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import io.socket.client.IO;
import io.socket.client.Socket;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Foreground service: one light "inbox" socket per chat room. When the friend sends something
 * and the app is not on screen, it shows a generic game-style notification (never any real content).
 */
public class WatcherService extends Service {
    static final String PREFS = "watcher";
    static final int ALERT_ID = 2;
    private static final int SERVICE_ID = 1;
    private static final String CH_SERVICE = "games_ready";
    private static final String CH_ALERT = "games_alert";
    private static final String[] TEXTS = {
        "Your game is waiting!", "Start your new game!", "A new game is ready!", "Time to play!"
    };

    private final List<Socket> sockets = new ArrayList<>();
    private final Random rnd = new Random();

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createChannels();
        Notification n = new NotificationCompat.Builder(this, CH_SERVICE)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Gamaroon")
            .setContentText("Ready to play")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(openApp())
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(SERVICE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(SERVICE_ID, n);
        }
        connectAll();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        closeAll();
        super.onDestroy();
    }

    private synchronized void closeAll() {
        for (Socket s : sockets) { s.off(); s.disconnect(); s.close(); }
        sockets.clear();
    }

    private synchronized void connectAll() {
        closeAll();
        try {
            String raw = SecureStore.get(this);
            if (raw == null) { stopSelf(); return; }
            JSONObject cfg = new JSONObject(raw);
            String server = cfg.optString("server", "");
            JSONArray rooms = cfg.optJSONArray("rooms");
            if (server.isEmpty() || rooms == null) { stopSelf(); return; }
            for (int i = 0; i < rooms.length(); i++) {
                watch(server, rooms.getJSONObject(i));
            }
        } catch (Exception ignored) { /* bad config: stay idle */ }
    }

    private void watch(final String server, final JSONObject room) throws Exception {
        final String role = room.optString("role");
        final String code = room.optString("code");
        final String secret = room.optString("secret");
        Map<String, String> auth = new HashMap<>();
        auth.put("code", code);
        auth.put("secret", secret);
        auth.put("inbox", "true");
        IO.Options opts = new IO.Options();
        opts.auth = auth;
        opts.transports = new String[] {"websocket"};
        opts.reconnection = true;
        final Socket s = IO.socket(URI.create(server), opts);
        s.on("ping", args -> {
            try {
                JSONObject p = (JSONObject) args[0];
                if (p.optBoolean("replay")) return;
                if (role.equals(p.optString("from"))) return;
                alert();
            } catch (Exception ignored) { }
        });
        s.on(Socket.EVENT_CONNECT_ERROR, args -> {
            // Server restarted and forgot our room: the owner registers it again, then reconnects.
            String msg = args.length > 0 ? String.valueOf(args[0]) : "";
            boolean ownerLost = msg.contains("no_room") && "owner".equals(role);
            // A guest whose room was forgotten joins again with the same code + secret.
            boolean guestLost = "guest".equals(role) && (msg.contains("no_room") || msg.contains("forbidden"));
            if (ownerLost || guestLost) {
                new Thread(() -> {
                    try {
                        JSONObject body = new JSONObject();
                        body.put("code", code);
                        body.put("secret", secret);
                        body.put("pub", room.optString("pub"));
                        HttpURLConnection c = (HttpURLConnection) new URL(server + (ownerLost ? "/api/host" : "/api/join")).openConnection();
                        c.setRequestMethod("POST");
                        c.setRequestProperty("Content-Type", "application/json");
                        c.setDoOutput(true);
                        try (OutputStream os = c.getOutputStream()) {
                            os.write(body.toString().getBytes(StandardCharsets.UTF_8));
                        }
                        int status = c.getResponseCode();
                        c.disconnect();
                        // owner not back yet (404): try again in a few seconds
                        Thread.sleep(guestLost && status == 404 ? 5000 : 500);
                        if (!(guestLost && status == 409)) s.connect();
                    } catch (Exception ignored) { }
                }).start();
            }
        });
        sockets.add(s);
        s.connect();
    }

    private void alert() {
        if (WatcherPlugin.appVisible) return;
        if (!getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("notify", true)) return;
        NotificationManagerCompat nm = NotificationManagerCompat.from(this);
        if (!nm.areNotificationsEnabled()) return;
        Notification n = new NotificationCompat.Builder(this, CH_ALERT)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Gamaroon")
            .setContentText(TEXTS[rnd.nextInt(TEXTS.length)])
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(openApp())
            .build();
        try { nm.notify(ALERT_ID, n); } catch (SecurityException ignored) { }
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CH_SERVICE, "Games", NotificationManager.IMPORTANCE_MIN));
        nm.createNotificationChannel(new NotificationChannel(CH_ALERT, "Game reminders", NotificationManager.IMPORTANCE_DEFAULT));
    }
}
