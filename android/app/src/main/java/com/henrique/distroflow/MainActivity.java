package com.henrique.distroflow; // <--- ESSA LINHA ERA A QUE FALTAVA

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    // Proteção para evitar erro caso a bridge ainda não esteja pronta
    if (this.bridge != null && this.bridge.getWebView() != null) {
        this.bridge.getWebView().clearCache(true);
        this.bridge.getWebView().clearHistory();
    }
  }
}