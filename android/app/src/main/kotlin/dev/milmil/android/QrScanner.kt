package dev.milmil.android

import android.Manifest
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

/** The permission the scanner needs; the caller asks for it. */
public const val CAMERA_PERMISSION: String = Manifest.permission.CAMERA

/**
 * Live camera preview that reports the first `milmil://pair` code it sees.
 *
 * Only pairing links fire [onPaired] — pointing the camera at any other QR
 * does nothing, rather than throwing the user into a failure screen for a
 * code that was never meant for this app.
 */
@Composable
public fun QrScanner(onPaired: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    // One analysis thread, released with the composable.
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember { BarcodeScanning.getClient() }

    Box(modifier = modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                val providerFuture = ProcessCameraProvider.getInstance(ctx)
                providerFuture.addListener({
                    val provider = providerFuture.get()
                    val preview = androidx.camera.core.Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    analysis.setAnalyzer(executor) { proxy ->
                        proxy.scanForPairLink(scanner, onPaired)
                    }
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                }, ContextCompat.getMainExecutor(ctx))
                previewView
            },
        )
    }
}

@androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
private fun ImageProxy.scanForPairLink(
    scanner: com.google.mlkit.vision.barcode.BarcodeScanner,
    onPaired: (String) -> Unit,
) {
    val media = image
    if (media == null) {
        close()
        return
    }
    val input = InputImage.fromMediaImage(media, imageInfo.rotationDegrees)
    scanner.process(input)
        .addOnSuccessListener { codes ->
            codes.firstNotNullOfOrNull { code ->
                code.rawValue?.takeIf { code.valueType == Barcode.TYPE_URL || it.startsWith("milmil://") }
            }?.let { raw ->
                // Ignore anything that is not one of ours.
                if (dev.milmil.api.PairLink.parse(raw) != null) onPaired(raw)
            }
        }
        .addOnCompleteListener { close() }
}
