package com.calcchat.app;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // FLAG_SECURE blocks screenshots, screen recording and the recent-apps
        // preview. It is ON for release builds (Play Store) and OFF for debug
        // builds, so screenshots stay possible while the app is being developed.
        // The user can change this in Settings ("Block screenshots"); that choice is kept in the "ui" preferences.
        boolean isDebug = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        boolean secure = getSharedPreferences("ui", MODE_PRIVATE).getBoolean("secure", !isDebug);
        if (secure) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
        registerPlugin(WatcherPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
