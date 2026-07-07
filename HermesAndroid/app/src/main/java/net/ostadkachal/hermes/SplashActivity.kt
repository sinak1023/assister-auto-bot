package net.ostadkachal.hermes

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import kotlinx.coroutines.delay
import net.ostadkachal.hermes.ui.theme.HermesBlue
import net.ostadkachal.hermes.ui.theme.HermesTheme
import net.ostadkachal.hermes.ui.theme.HermesViolet

class SplashActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HermesTheme(darkTheme = true) {
                SplashContent(onDone = {
                    startActivity(Intent(this, MainActivity::class.java))
                    overridePendingTransition(0, 0)
                    finish()
                })
            }
        }
    }
}

@androidx.compose.runtime.Composable
private fun SplashContent(onDone: () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    val alpha by animateFloatAsState(if (visible) 1f else 0f, tween(700), label = "a")
    val scale by animateFloatAsState(if (visible) 1f else 0.8f, tween(700), label = "s")

    LaunchedEffect(Unit) {
        visible = true
        delay(2100)
        onDone()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF0B0F14), Color(0xFF10192B), Color(0xFF0B0F14))
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(
                painter = painterResource(R.drawable.ic_hermes_logo),
                contentDescription = null,
                modifier = Modifier
                    .size(132.dp)
                    .scale(scale)
                    .alpha(alpha)
            )
            Text(
                text = "Hermes",
                color = Color.White,
                fontSize = 40.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.alpha(alpha)
            )
            Text(
                text = stringResource(R.string.tagline),
                color = HermesBlue,
                fontSize = 14.sp,
                modifier = Modifier
                    .padding(top = 4.dp)
                    .alpha(alpha)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 48.dp),
            verticalArrangement = Arrangement.Bottom,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .height(3.dp)
                    .size(width = 54.dp, height = 3.dp)
                    .alpha(alpha)
                    .background(
                        Brush.horizontalGradient(listOf(HermesBlue, HermesViolet))
                    )
            )
            Text(
                text = stringResource(R.string.splash_credit),
                color = Color(0xFF8FA1B5),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .padding(top = 14.dp)
                    .alpha(alpha)
            )
        }
    }
}
