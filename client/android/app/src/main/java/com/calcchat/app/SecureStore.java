package com.calcchat.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Keeps the watcher's chat secrets encrypted at rest. The AES-GCM key lives in the Android Keystore
 * (hardware-backed where the phone supports it) and never leaves it, so the saved value is useless
 * without this app on this phone. Destroying the key makes the saved value unreadable for good.
 */
final class SecureStore {
    private static final String ALIAS = "watcher_cfg_key";
    private static final String PROVIDER = "AndroidKeyStore";
    private static final String KEY = "config_enc";

    private SecureStore() { }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(PROVIDER);
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER);
        kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return kg.generateKey();
    }

    /** Encrypts text with the Keystore key; returns base64 (iv + ciphertext) or null when the Keystore is unavailable. */
    static String seal(String plain) {
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV();
            byte[] ct = c.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            byte[] out = new byte[iv.length + ct.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ct, 0, out, iv.length, ct.length);
            return Base64.encodeToString(out, Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    /** Reverse of seal(); null if it cannot be decrypted (for example after the key was destroyed). */
    static String unseal(String b64) {
        try {
            byte[] in = Base64.decode(b64, Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, in, 0, 12));
            return new String(c.doFinal(in, 12, in.length - 12), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    /** Encrypts and stores. Returns false when the Keystore is unavailable (nothing is stored then). */
    static boolean put(Context ctx, String plain) {
        String sealed = seal(plain);
        if (sealed == null) return false;
        prefs(ctx).edit().remove("config").putString(KEY, sealed).apply(); // also drops any old plain-text copy
        return true;
    }

    /** Returns the stored text, or null if there is none or it cannot be decrypted. */
    static String get(Context ctx) {
        String b64 = prefs(ctx).getString(KEY, null);
        return b64 == null ? null : unseal(b64);
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().remove(KEY).apply();
    }

    /** Wipe: remove the stored value and destroy the Keystore key. */
    static void destroy(Context ctx) {
        clear(ctx);
        try {
            KeyStore ks = KeyStore.getInstance(PROVIDER);
            ks.load(null);
            if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
        } catch (Exception ignored) { }
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(WatcherService.PREFS, Context.MODE_PRIVATE);
    }
}
