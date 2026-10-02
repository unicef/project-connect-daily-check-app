# ndt7client.aar

Go ndt7 client used by `NetworkTestWorker`, built with gomobile from
[unicef/giga-ndt7-go-client](https://github.com/unicef/giga-ndt7-go-client).

| | |
|---|---|
| Source commit | `36e3216aa4a105be01ab56a83bc2b2befe6dfbf8` |
| Go | go1.26.4 |
| Android NDK | 27.2.12479018 |
| gomobile | `golang.org/x/mobile v0.0.0-20260908204917-8b95e45f8d3e` |
| SHA-256 | `2c07a0d8aaea1b17460c3ae04a150117a859d1f38d360bdc7c68e7655a95a550` |

## Rebuilding

From a checkout of the Go repo at the commit above:

```sh
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_NDK_HOME=$ANDROID_HOME/ndk/27.2.12479018
./build-aar.sh
cp ndt7client.aar <this repo>/android/app/libs/
```

`build-aar.sh` prints the commit, Go version and SHA-256 of the archive it
builds. Update the table above with those values whenever this file changes.
gomobile builds are not byte-for-byte reproducible, so a rebuild of the same
commit can have a different SHA-256.

## 16 KB page alignment

Google Play requires native libraries to support 16 KB memory pages for apps
targeting SDK 35 and later. `build-aar.sh` links with a 16 KB maximum page
size. To check an archive:

```sh
unzip -o ndt7client.aar 'jni/*' -d /tmp/ndt7client
for so in /tmp/ndt7client/jni/*/libgojni.so; do
  "$ANDROID_NDK_HOME"/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-readelf -lW "$so" \
    | awk -v so="$so" '/LOAD/ {print so, $NF}'
done
```

Every `LOAD` segment must show `0x4000`. `0x1000` means 4 KB and Play will
reject the build.

## Size

Each ABI adds one `libgojni.so`: about 12 MB uncompressed and 5 MB
compressed (armeabi-v7a, arm64-v8a and x86_64). An App Bundle delivers only
the ABI a device needs.
