package app.hackathonbase.staff;

import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.VideoView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Plays the HackGround OS intro (res/raw/intro.mp4, made with Remotion in
 * mobile/intro) over a dark screen when the app opens, and fades it out once
 * the intro has finished and the site has loaded (at most 10 seconds).
 */
public class MainActivity extends BridgeActivity {
    private static final int INTRO_BG = Color.parseColor("#0D0F1C");
    private static final int APP_BAR_BG = Color.parseColor("#F8FAFC");
    private static final long MAX_INTRO_MS = 10000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout intro;
    private long introStartedAt;
    private boolean introFinished;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState == null) showIntro();
    }

    private void showIntro() {
        introStartedAt = System.currentTimeMillis();
        intro = new FrameLayout(this);
        intro.setBackgroundColor(INTRO_BG);
        intro.setClickable(true); // taps don't reach the page underneath

        VideoView video = new VideoView(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) video.setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE); // don't pause the user's music
        intro.addView(video, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
        addContentView(intro, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setBars(true);

        video.setVideoURI(Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.intro));
        video.setOnPreparedListener(player -> {
            player.setVolume(0f, 0f);
            video.start();
        });
        video.setOnCompletionListener(player -> introFinished = true);
        video.setOnErrorListener((player, what, extra) -> {
            introFinished = true;
            return true;
        });
        handler.postDelayed(this::hideIntroWhenReady, 200);
    }

    private void hideIntroWhenReady() {
        if (intro == null) return;
        WebView web = getBridge() != null ? getBridge().getWebView() : null;
        boolean pageLoaded = web != null && web.getProgress() >= 100;
        boolean tooLong = System.currentTimeMillis() - introStartedAt > MAX_INTRO_MS;
        if (!((introFinished && pageLoaded) || tooLong)) {
            handler.postDelayed(this::hideIntroWhenReady, 100);
            return;
        }
        View view = intro;
        intro = null;
        setBars(false);
        view.animate().alpha(0f).setDuration(300).withEndAction(() -> {
            ViewGroup parent = (ViewGroup) view.getParent();
            if (parent != null) parent.removeView(view);
        }).start();
    }

    /** Dark status bar during the intro, then the app's light one. */
    private void setBars(boolean dark) {
        Window window = getWindow();
        window.setStatusBarColor(dark ? INTRO_BG : APP_BAR_BG);
        WindowCompat.getInsetsController(window, window.getDecorView()).setAppearanceLightStatusBars(!dark);
    }
}
