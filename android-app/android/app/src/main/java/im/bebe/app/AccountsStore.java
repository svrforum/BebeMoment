package im.bebe.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 연결된 가족(인스턴스) 목록과 활성 서버. Capacitor Preferences 와 같은
 * SharedPreferences 그룹을 공유해, 로컬 번들 페이지(accounts.js)와 네이티브가 같은
 * 목록을 본다.
 *
 * bebeAccounts 는 UI 스레드(시드)와 워커 스레드(라벨)에서 read-modify-write 되므로
 * 한 락으로 직렬화한다 — 안 그러면 동시 기록이 서로를 덮어써 계정이 사라진다.
 */
final class AccountsStore {

    static final String PREFS = "CapacitorStorage";
    static final String ACCOUNTS_KEY = "bebeAccounts";
    static final String SERVER_KEY = "serverUrl";

    private static final Object LOCK = new Object();

    private AccountsStore() {}

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** 활성 서버 주소(저장된 그대로). 없으면 null. */
    static String readServerUrl(Context ctx) {
        try {
            return prefs(ctx).getString(SERVER_KEY, null);
        } catch (Exception e) {
            NativeDiagnostics.warn("accounts", "read-server-url", e);
            return null;
        }
    }

    /** 활성 서버의 base URL(끝 슬래시 제거). 없으면 null. */
    static String readServerBase(Context ctx) {
        return DeepLinks.base(readServerUrl(ctx));
    }

    /** 활성 서버 전환 — 알림·위젯이 다른 가족 출처일 때. */
    static void setActiveServer(Context ctx, String base) {
        try {
            prefs(ctx).edit().putString(SERVER_KEY, base).apply();
        } catch (Exception e) {
            NativeDiagnostics.warn("accounts", "set-active-server", e);
        }
    }

    /** 저장된 계정들의 base URL(끝 슬래시 제거) 목록. */
    static List<String> readBases(Context ctx) {
        final List<String> out = new ArrayList<>();
        try {
            final JSONArray list = readList(ctx);
            for (int i = 0; i < list.length(); i++) {
                final JSONObject o = list.optJSONObject(i);
                final String u = o != null ? o.optString("url", "") : "";
                if (!u.isEmpty()) out.add(DeepLinks.base(u));
            }
        } catch (Exception e) {
            NativeDiagnostics.warn("accounts", "read-bases", e);
        }
        return out;
    }

    private static JSONArray readList(Context ctx) throws Exception {
        final String raw = prefs(ctx).getString(ACCOUNTS_KEY, null);
        return (raw != null && !raw.isEmpty()) ? new JSONArray(raw) : new JSONArray();
    }

    /**
     * 활성 서버 계정이 아직 가족 이름 라벨이 없는지(또는 목록에 없는지).
     *
     * onResume 만으론 WebView 안에서 로그인·초대수락한 직후(액티비티 재개가 없어) 라벨이
     * 갱신되지 않았다. 이미 이름이 있으면 매 화면 전환마다 라벨 요청을 보내지 않게 false.
     */
    static boolean activeAccountNeedsLabel(Context ctx) {
        final String base = readServerBase(ctx);
        if (base == null) return false;
        synchronized (LOCK) {
            try {
                final String raw = prefs(ctx).getString(ACCOUNTS_KEY, null);
                if (raw == null || raw.isEmpty()) return true; // 아직 시드 전
                final JSONArray list = new JSONArray(raw);
                for (int i = 0; i < list.length(); i++) {
                    final JSONObject o = list.optJSONObject(i);
                    if (o != null && base.equals(o.optString("url"))) {
                        return o.optString("name", "").trim().isEmpty();
                    }
                }
                return true; // 목록에 아직 없음 → 시드+라벨 필요
            } catch (Exception e) {
                NativeDiagnostics.warn("accounts", "needs-label", e);
                return true;
            }
        }
    }

    /** 계정 목록에 이 서버가 있도록 보장(구버전 단일 계정 마이그레이션 포함). */
    static void ensureAccount(Context ctx, String base) {
        synchronized (LOCK) {
            try {
                final JSONArray list = readList(ctx);
                for (int i = 0; i < list.length(); i++) {
                    final JSONObject o = list.optJSONObject(i);
                    if (o != null && base.equals(o.optString("url"))) return;
                }
                final JSONObject o = new JSONObject();
                o.put("url", base);
                o.put("name", "");
                list.put(o);
                prefs(ctx).edit().putString(ACCOUNTS_KEY, list.toString()).apply();
            } catch (Exception e) {
                NativeDiagnostics.warn("accounts", "ensure-account", e);
            }
        }
    }

    /** 가족 이름 라벨을 채운다(달라졌을 때만 기록). */
    static void setAccountName(Context ctx, String base, String name) {
        if (name == null || name.isEmpty()) return;
        synchronized (LOCK) {
            try {
                final JSONArray list = readList(ctx);
                boolean changed = false;
                for (int i = 0; i < list.length(); i++) {
                    final JSONObject o = list.optJSONObject(i);
                    if (o != null && base.equals(o.optString("url"))) {
                        if (!name.equals(o.optString("name"))) {
                            o.put("name", name);
                            changed = true;
                        }
                        break;
                    }
                }
                if (changed) prefs(ctx).edit().putString(ACCOUNTS_KEY, list.toString()).apply();
            } catch (Exception e) {
                NativeDiagnostics.warn("accounts", "set-account-name", e);
            }
        }
    }
}
