/**
 * Config plugin to fix Kotlin/KSP version mismatch on EAS Build.
 * Forces Kotlin Gradle Plugin to 2.0.21 to match KSP 2.0.21-1.0.28.
 * See: https://github.com/expo/expo/issues/37073
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const KOTLIN_VERSION = '2.0.21';

// Force Kotlin 2.0.21 in buildscript classpath for KSP compatibility
const kotlinResolutionBlock = `
// Force Kotlin 2.0.21 for KSP compatibility (expo-updates)
buildscript {
    configurations.classpath {
        resolutionStrategy {
            force 'org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}'
        }
    }
}
`;

function withKotlinVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    const buildGradle = config.modResults.contents;
    if (buildGradle.includes('Force Kotlin 2.0.21 for KSP compatibility')) {
      return config;
    }
    // Prepend after any shebang/comment - add at start so it runs before other deps
    config.modResults.contents = kotlinResolutionBlock + '\n' + buildGradle;
    return config;
  });
}

module.exports = withKotlinVersion;
