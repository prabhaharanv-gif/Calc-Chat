package com.calcchat.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // FLAG_SECURE blocks screenshots, screen recording and the recent-apps preview.
        // It is ON by default in every build (debug too); the user can switch it off in Settings
        // ("Block screenshots"), and that choice is kept in the "ui" preferences.
        boolean secure = getSharedPreferences("ui", MODE_PRIVATE).getBoolean("secure", true);
        if (secure) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
        registerPlugin(WatcherPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
