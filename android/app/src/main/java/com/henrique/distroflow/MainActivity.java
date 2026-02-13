import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // força a recarregar sem cache ao reabrir (debug)
    this.bridge.getWebView().clearCache(true);
    this.bridge.getWebView().clearHistory();
  }
}
