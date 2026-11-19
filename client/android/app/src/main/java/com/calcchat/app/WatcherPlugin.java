package com.calcchat.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.view.WindowManager;
import android.webkit.CookieManager;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web app start/stop the background watcher service. The service keeps a tiny "inbox"
 * connection to the server and shows a disguised "game" notification when a friend writes.
 * No message content, name or code ever reaches the notification.
 */
@CapacitorPlugin(name = "Watcher")
public class WatcherPlugin extends Plugin {
    /** True while the app screen is open (no notification is shown then). */
    static volatile boolean appVisible = false;

    @PluginMethod
    public void start(PluginCall call) {
        Context ctx = getContext();
        JSObject data = call.getData();
        // Room secrets are stored encrypted with a Keystore key. If the Keystore is unavailable, nothing is stored
        // and the watcher stays off (never plain text).
        if (!SecureStore.put(ctx, data.toString())) {
            ctx.stopService(new Intent(ctx, WatcherService.class));
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && getActivity() != null) {
            ActivityCompat.requestPermissions(getActivity(), new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
        ContextCompat.startForegroundService(ctx, new Intent(ctx, WatcherService.class));
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        SecureStore.clear(ctx);
        ctx.stopService(new Intent(ctx, WatcherService.class));
        call.resolve();
    }

    /** Screenshots / screen recording / recent-apps preview: on = blocked (FLAG_SECURE). The choice is remembered. */
    @PluginMethod
    public void setSecure(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        getContext().getSharedPreferences("ui", Context.MODE_PRIVATE).edit().putBoolean("secure", on).apply();
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void getSecure(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("enabled", ctx.getSharedPreferences("ui", Context.MODE_PRIVATE).getBoolean("secure", true));
        call.resolve(r);
    }

    /** PIN attempt counter, sealed with the Keystore so editing the app's files cannot reset it. */
    @PluginMethod
    public void getFails(PluginCall call) {
        String blob = getContext().getSharedPreferences("ui", Context.MODE_PRIVATE).getString("fails_enc", null);
        JSObject r = new JSObject();
        if (blob == null) { r.put("n", 0); r.put("tampered", false); call.resolve(r); return; }
        String text = SecureStore.unseal(blob);
        try { r.put("n", Integer.parseInt(text)); r.put("tampered", false); }
        catch (Exception e) { r.put("n", 0); r.put("tampered", true); }
        call.resolve(r);
    }

    @PluginMethod
    public void setFails(PluginCall call) {
        int n = call.getInt("n", 0);
        android.content.SharedPreferences.Editor ed = getContext().getSharedPreferences("ui", Context.MODE_PRIVATE).edit();
        String blob = n > 0 ? SecureStore.seal(String.valueOf(n)) : null;
        if (blob != null) ed.putString("fails_enc", blob); else ed.remove("fails_enc");
        ed.apply();
        call.resolve();
    }

    /** Seal / unseal a small secret (the chat private key) with the Android Keystore. */
    @PluginMethod
    public void seal(PluginCall call) {
        String blob = SecureStore.seal(call.getString("text", ""));
        JSObject r = new JSObject();
        r.put("blob", blob);
        call.resolve(r);
    }

    @PluginMethod
    public void unseal(PluginCall call) {
        String text = SecureStore.unseal(call.getString("blob", ""));
        JSObject r = new JSObject();
        r.put("text", text);
        call.resolve(r);
    }

    /** Auto-wipe: stop the watcher, drop every notification and saved setting, empty the WebView caches/cookies (the page erases its own storage, keeping only the tiny server-retry queue). */
    @PluginMethod
    public void wipe(PluginCall call) {
        Context ctx = getContext();
        ctx.stopService(new Intent(ctx, WatcherService.class));
        NotificationManagerCompat.from(ctx).cancelAll();
        ctx.getSharedPreferences(WatcherService.PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        ctx.getSharedPreferences("ui", Context.MODE_PRIVATE).edit().remove("fails_enc").apply();
        SecureStore.destroy(ctx); // also destroys the Keystore key
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                try {
                    CookieManager.getInstance().removeAllCookies(null);
                    getBridge().getWebView().clearCache(true);
                    getBridge().getWebView().clearHistory();
                } catch (Exception ignored) { }
            });
        }
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        appVisible = true;
        NotificationManagerCompat.from(getContext()).cancel(WatcherService.ALERT_ID);
    }

    @Override
    protected void handleOnPause() {
        appVisible = false;
    }
}
