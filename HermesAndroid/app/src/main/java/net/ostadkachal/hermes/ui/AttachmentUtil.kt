package net.ostadkachal.hermes.ui

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import net.ostadkachal.hermes.model.Attachment

/** Reads a picked file into an [Attachment] (image → base64, text → inlined). */
fun readAttachment(context: Context, uri: Uri): Attachment? {
    return try {
        val cr = context.contentResolver
        val mime = cr.getType(uri) ?: "application/octet-stream"
        val name = queryName(context, uri) ?: "file"
        val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: return null
        if (bytes.size > 8 * 1024 * 1024) return null // 8MB guard
        if (mime.startsWith("image/")) {
            Attachment(
                kind = Attachment.Kind.IMAGE,
                name = name,
                mimeType = mime,
                base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            )
        } else {
            val text = String(bytes, Charsets.UTF_8).take(200_000)
            Attachment(kind = Attachment.Kind.TEXT, name = name, mimeType = mime, text = text)
        }
    } catch (e: Exception) {
        null
    }
}

private fun queryName(context: Context, uri: Uri): String? {
    return try {
        context.contentResolver.query(uri, null, null, null, null)?.use { c ->
            val i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (i >= 0 && c.moveToFirst()) c.getString(i) else null
        }
    } catch (e: Exception) {
        null
    }
}

/** Decodes a base64 image (best-effort, downsampled) for thumbnail display. */
fun decodeThumb(base64: String?): ImageBitmap? {
    if (base64.isNullOrBlank()) return null
    return try {
        val bytes = Base64.decode(base64, Base64.NO_WRAP)
        val opts = BitmapFactory.Options().apply { inSampleSize = 2 }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)?.asImageBitmap()
    } catch (e: Exception) {
        null
    }
}
