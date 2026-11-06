# Android project template

Copy the .github/workflows/build-apk.yml file into the generated Android repository. The workflow builds a debug APK on relevant Gradle/source pushes and supports a manually dispatched debug or release build.

Requirements:
- A valid Android Gradle project with gradlew, gradle/wrapper/, and an app module.
- JDK 17 compatibility (adjust only after checking the project's Android Gradle Plugin requirements).
- GitHub Actions enabled for the repository.

The resulting APK is stored as a GitHub Actions artifact for seven days. This template does not sign a production APK, publish to an app store, or automatically attach artifacts to a Space conversation. Release signing must use separately configured repository secrets and an explicit owner-approved release process.
