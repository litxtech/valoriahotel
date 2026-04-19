const fs = require('node:fs');
const path = require('node:path');

/** EAS/npm on Windows may use CRLF; Xcode builds use LF — normalize before string matches. */
function normalizeLf(s) {
  return s.replace(/\r\n/g, '\n');
}

function replaceOnce(haystack, needle, replacement) {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return { ok: false, out: haystack };
  return {
    ok: true,
    out: haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length),
  };
}

function main() {
  const vcRoot = path.join(__dirname, '..', 'node_modules', 'react-native-vision-camera');
  const mediaSubtypePath = path.join(
    vcRoot,
    'ios',
    'Extensions',
    'CoreMedia',
    'CMFormatDescription.MediaSubType+hidden.swift'
  );
  const depthOutputPath = path.join(
    vcRoot,
    'ios',
    'Hybrid Objects',
    'Outputs',
    'HybridCameraDepthFrameOutput.swift'
  );

  // ---- Patch 1: RAW Bayer constant (Xcode 16 / iOS 18 SDK compatibility) ----
  // Replace the symbol only — regex block matching failed on some CI line endings.
  if (fs.existsSync(mediaSubtypePath)) {
    let src = normalizeLf(fs.readFileSync(mediaSubtypePath, 'utf8'));
    if (src.includes('kCVPixelFormatType_96VersatileBayerPacked12')) {
      // Only replace the `rawValue:` use — do not touch the same name inside doc comments.
      const out = src.replace(
        /rawValue:\s*kCVPixelFormatType_96VersatileBayerPacked12/g,
        'rawValue: 0 /* unavailable on this SDK; vision-camera postinstall */'
      );
      if (out !== src) {
        fs.writeFileSync(mediaSubtypePath, out, 'utf8');
        console.log('[postinstall] Patched vision-camera RAW Bayer constant for older SDKs.');
      }
    } else {
      console.log('[postinstall] vision-camera RAW Bayer patch: symbol not referenced; skipping.');
    }
  } else {
    console.log(`[postinstall] vision-camera file not found, skipping: ${mediaSubtypePath}`);
  }

  // ---- Patch 1b: AVCaptureColorSpace / interruption / file types (iOS 26 SDK symbols missing on Xcode 16) ----
  // Swift resolves enum cases at compile time; #available does not help. Drop cases / branches so older SDKs compile.
  const sdkShimFiles = [
    {
      rel: ['ios', 'Extensions', 'Converters', 'AV+ColorSpace.swift'],
      description: 'Remove AVCaptureColorSpace.appleLog2 (iOS 26+)',
      from:
        '    case .appleLog:\n' +
        '      self = .appleLog\n' +
        '    case .appleLog2:\n' +
        '      self = .appleLog2\n' +
        '    @unknown default:',
      to:
        '    case .appleLog:\n' +
        '      self = .appleLog\n' +
        '    @unknown default:',
    },
    {
      rel: ['ios', 'Extensions', 'Converters', 'AV+InterruptionReason.swift'],
      description: 'Remove sensitiveContentMitigationActivated (iOS 26+)',
      from:
        '    case .videoDeviceNotAvailableDueToSystemPressure:\n' +
        '      self = .videoDeviceNotAvailableDueToSystemPressure\n' +
        '    case .sensitiveContentMitigationActivated:\n' +
        '      self = .sensitiveContentMitigationActivated\n' +
        '    @unknown default:',
      to:
        '    case .videoDeviceNotAvailableDueToSystemPressure:\n' +
        '      self = .videoDeviceNotAvailableDueToSystemPressure\n' +
        '    @unknown default:',
    },
    {
      rel: ['ios', 'Extensions', 'Converters', 'AV+PhotoContainerFormat.swift'],
      description: 'Remove AVFileType.dcm branch (iOS 26+)',
      from:
        '    default:\n' +
        '      if #available(iOS 26.0, *) {\n' +
        '        if avFileType == .dcm {\n' +
        '          self = .dcm\n' +
        '          return\n' +
        '        }\n' +
        '      }\n' +
        '      logger.error("Received unknown AVFileType: \\(avFileType.rawValue)")\n' +
        '      self = .unknown',
      to:
        '    default:\n' +
        '      logger.error("Received unknown AVFileType: \\(avFileType.rawValue)")\n' +
        '      self = .unknown',
    },
  ];

  for (const f of sdkShimFiles) {
    const filePath = path.join(vcRoot, ...f.rel);
    if (!fs.existsSync(filePath)) {
      console.log(`[postinstall] vision-camera file not found, skipping: ${filePath}`);
      continue;
    }
    const src = normalizeLf(fs.readFileSync(filePath, 'utf8'));
    const r = replaceOnce(src, normalizeLf(f.from), normalizeLf(f.to));
    if (r.ok) {
      fs.writeFileSync(filePath, r.out, 'utf8');
      console.log(`[postinstall] Patched vision-camera: ${f.description}`);
    } else {
      console.log(
        `[postinstall] vision-camera SDK shim not applied (already patched or upstream changed): ${f.description}`
      );
    }
  }

  // ---- Patch 2: iOS 26-only AVCaptureDepthDataOutput properties (SDK-gated) ----
  // Referencing `isDeferredStartSupported` fails on Xcode 16 / iOS 18 SDK even inside `#available`.
  if (fs.existsSync(depthOutputPath)) {
    let src = normalizeLf(fs.readFileSync(depthOutputPath, 'utf8'));
    if (src.includes('NSSelectorFromString("isDeferredStartSupported")')) {
      console.log('[postinstall] vision-camera deferredStart: already using runtime selectors; skipping.');
    } else if (src.includes('isDeferredStartSupported') || src.includes('isDeferredStartEnabled')) {
      const blockReplacement =
        "    // iOS 26 added deferred start for depth output. Referencing those properties directly\n" +
        "    // breaks compilation on older SDKs (even with #available). Use runtime selectors instead.\n" +
        "    if #available(iOS 26.0, *) {\n" +
        "      let supportedSel = NSSelectorFromString(\"isDeferredStartSupported\")\n" +
        "      let enabledSel = NSSelectorFromString(\"setDeferredStartEnabled:\")\n" +
        "      if output.responds(to: supportedSel) {\n" +
        "        let supported = (output.perform(supportedSel)?.takeUnretainedValue() as? NSNumber)?.boolValue ?? false\n" +
        "        if supported, output.responds(to: enabledSel) {\n" +
        "          output.perform(enabledSel, with: NSNumber(value: options.allowDeferredStart))\n" +
        "        }\n" +
        "      }\n" +
        "    }\n";

      const blockNeedle =
        "    if #available(iOS 26.0, *), output.isDeferredStartSupported {\n" +
        "      // Deferred start allows the Session to delay this output's startup in favor\n" +
        "      // of preview-related outputs to make preview appear faster.\n" +
        "      output.isDeferredStartEnabled = options.allowDeferredStart\n" +
        "    }\n";

      let out = src;
      const r = replaceOnce(out, blockNeedle, blockReplacement);
      if (r.ok) {
        out = r.out;
      } else {
        const reDeferred =
          /\n    if #available\(iOS 26\.0, \*\), output\.isDeferredStartSupported \{[\s\S]*?\n    \}\n/;
        if (reDeferred.test(out)) {
          out = out.replace(reDeferred, '\n' + blockReplacement);
        }
      }
      if (out !== src) {
        fs.writeFileSync(depthOutputPath, out, 'utf8');
        console.log('[postinstall] Patched vision-camera deferredStart properties for older SDKs.');
      } else {
        console.log('[postinstall] vision-camera deferredStart patch: block not found; no changes applied.');
      }
    } else {
      console.log('[postinstall] vision-camera deferredStart patch: symbols not referenced; skipping.');
    }
  } else {
    console.log(`[postinstall] vision-camera file not found, skipping: ${depthOutputPath}`);
  }

  // ---- Patch 2b: HybridCameraVideoFrameOutput — iOS 26-only AVCaptureVideoDataOutput / recorder APIs ----
  // Same compile-time issue: members missing from iOS 18 SDK headers even inside `#available(iOS 26, *)`.
  const videoFrameOutputPath = path.join(
    vcRoot,
    'ios',
    'Hybrid Objects',
    'Outputs',
    'HybridCameraVideoFrameOutput.swift'
  );
  if (fs.existsSync(videoFrameOutputPath)) {
    let src = normalizeLf(fs.readFileSync(videoFrameOutputPath, 'utf8'));
    let changed = false;

    const initFrom =
      '    if #available(iOS 26.0, *) {\n' +
      '      // We only use this output for recording, allowing it to start deferred makes the session start faster.\n' +
      '      if output.isDeferredStartSupported {\n' +
      '        output.isDeferredStartEnabled = true\n' +
      '      }\n' +
      '      // Allow capturing HDR\n' +
      '      output.preservesDynamicHDRMetadata = true\n' +
      '    }\n';
    const initTo =
      '    if #available(iOS 26.0, *) {\n' +
      '      let defSupportedSel = NSSelectorFromString("isDeferredStartSupported")\n' +
      '      let defEnabledSel = NSSelectorFromString("setDeferredStartEnabled:")\n' +
      '      if output.responds(to: defSupportedSel),\n' +
      '        ((output.perform(defSupportedSel)?.takeUnretainedValue() as? NSNumber)?.boolValue ?? false),\n' +
      '        output.responds(to: defEnabledSel) {\n' +
      '        output.perform(defEnabledSel, with: NSNumber(value: true))\n' +
      '      }\n' +
      '      let hdrSel = NSSelectorFromString("setPreservesDynamicHDRMetadata:")\n' +
      '      if output.responds(to: hdrSel) {\n' +
      '        output.perform(hdrSel, with: NSNumber(value: true))\n' +
      '      }\n' +
      '    }\n';

    const r1 = replaceOnce(src, initFrom, initTo);
    if (r1.ok) {
      src = r1.out;
      changed = true;
    }

    const metaFrom =
      '      if #available(iOS 26.0, *) {\n' +
      '        // 2.1.a. Set video timescale if available. This avoids audio/video sync-drift in super long videos.\n' +
      '        recorder.setTimescale(self.output.recommendedMediaTimeScaleForAssetWriter)\n' +
      '        let codec = self.getCurrentVideoCodec()\n' +
      '        if let metadata = self.output.recommendedMovieMetadata(\n' +
      '          forVideoCodecType: codec, assetWriterOutputFileType: self.fileType)\n' +
      '        {\n' +
      '          // 2.2. Set metadata if available\n' +
      '          try recorder.setMetadata(metadata, settings: settings)\n' +
      '        }\n' +
      '      } else {\n' +
      '        // 2.1.b. Set metadata before iOS 26.0\n' +
      '        try recorder.setMetadata([], settings: settings)\n' +
      '      }\n';
    const metaTo = '      try recorder.setMetadata([], settings: settings)\n';

    const r2 = replaceOnce(src, metaFrom, metaTo);
    if (r2.ok) {
      src = r2.out;
      changed = true;
    }

    // Fallback: pristine upstream still uses direct property access (string match failed).
    if (/if output\.isDeferredStartSupported/.test(src) && !src.includes('defSupportedSel')) {
      const reVfInit =
        /\n    if #available\(iOS 26\.0, \*\) \{[\s\S]*?\/\/ Allow capturing HDR\n      output\.preservesDynamicHDRMetadata = true\n    \}\n/;
      if (reVfInit.test(src)) {
        src = src.replace(reVfInit, '\n' + initTo);
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(videoFrameOutputPath, src, 'utf8');
      console.log('[postinstall] Patched vision-camera HybridCameraVideoFrameOutput for older iOS SDKs.');
    } else if (src.includes('recommendedMediaTimeScaleForAssetWriter')) {
      console.log(
        '[postinstall] vision-camera HybridCameraVideoFrameOutput: still has iOS 26-only symbols; patterns may need an update.'
      );
    } else {
      console.log('[postinstall] vision-camera HybridCameraVideoFrameOutput: already patched or upstream changed; skipping.');
    }
  } else {
    console.log(`[postinstall] vision-camera file not found, skipping: ${videoFrameOutputPath}`);
  }

  // ---- Patch 2c: HybridCameraDevice / FrameOutput / PhotoOutput (iOS 26-only AV APIs) ----
  const extraSdkPatches = [
    {
      rel: ['ios', 'Hybrid Objects', 'Inputs', 'HybridCameraDevice.swift'],
      description: 'focalLength: KVC for nominalFocalLengthIn35mmFilm',
      from:
        '  var focalLength: Double? {\n' +
        '    guard #available(iOS 26.0, *) else {\n' +
        '      return nil\n' +
        '    }\n' +
        '    return Double(device.nominalFocalLengthIn35mmFilm)\n' +
        '  }\n',
      to:
        '  var focalLength: Double? {\n' +
        '    guard #available(iOS 26.0, *) else {\n' +
        '      return nil\n' +
        '    }\n' +
        '    if let n = (device as NSObject).value(forKey: "nominalFocalLengthIn35mmFilm") as? NSNumber {\n' +
        '      return n.doubleValue\n' +
        '    }\n' +
        '    return nil\n' +
        '  }\n',
    },
    {
      rel: ['ios', 'Hybrid Objects', 'Outputs', 'HybridCameraFrameOutput.swift'],
      description: 'FrameOutput deferred start + HDR via runtime',
      from:
        '    if #available(iOS 26.0, *), output.isDeferredStartSupported {\n' +
        '      // Deferred start allows the Session to delay this output\'s startup in favor\n' +
        '      // of preview-related outputs to make preview appear faster.\n' +
        '      output.isDeferredStartEnabled = options.allowDeferredStart\n' +
        '    }\n',
      to:
        '    if #available(iOS 26.0, *) {\n' +
        '      let supportedSel = NSSelectorFromString("isDeferredStartSupported")\n' +
        '      let enabledSel = NSSelectorFromString("setDeferredStartEnabled:")\n' +
        '      if output.responds(to: supportedSel),\n' +
        '        ((output.perform(supportedSel)?.takeUnretainedValue() as? NSNumber)?.boolValue ?? false),\n' +
        '        output.responds(to: enabledSel) {\n' +
        '        output.perform(enabledSel, with: NSNumber(value: options.allowDeferredStart))\n' +
        '      }\n' +
        '    }\n',
    },
    {
      rel: ['ios', 'Hybrid Objects', 'Outputs', 'HybridCameraFrameOutput.swift'],
      description: 'FrameOutput preservesDynamicHDRMetadata via runtime',
      from:
        '    if #available(iOS 26.0, *) {\n' +
        '      // We don\'t need HDR metadata, as that\'s only useful for encoders.\n' +
        '      output.preservesDynamicHDRMetadata = false\n' +
        '    }\n',
      to:
        '    if #available(iOS 26.0, *) {\n' +
        '      let hdrSel = NSSelectorFromString("setPreservesDynamicHDRMetadata:")\n' +
        '      if output.responds(to: hdrSel) {\n' +
        '        output.perform(hdrSel, with: NSNumber(value: false))\n' +
        '      }\n' +
        '    }\n',
    },
    {
      rel: ['ios', 'Hybrid Objects', 'Outputs', 'HybridCameraPhotoOutput.swift'],
      description: 'PhotoOutput camera sensor orientation compensation via runtime',
      from:
        '    if #available(iOS 26, *),\n' +
        '      output.isCameraSensorOrientationCompensationSupported\n' +
        '    {\n' +
        '      // Don\'t rotate Photo buffers - we handle orientation later on in file capture or toImage().\n' +
        '      output.isCameraSensorOrientationCompensationEnabled = false\n' +
        '    }\n',
      to:
        '    if #available(iOS 26, *) {\n' +
        '      let compSupportedSel = NSSelectorFromString("isCameraSensorOrientationCompensationSupported")\n' +
        '      let compEnabledSel = NSSelectorFromString("setCameraSensorOrientationCompensationEnabled:")\n' +
        '      if output.responds(to: compSupportedSel),\n' +
        '        ((output.perform(compSupportedSel)?.takeUnretainedValue() as? NSNumber)?.boolValue ?? false),\n' +
        '        output.responds(to: compEnabledSel) {\n' +
        '        output.perform(compEnabledSel, with: NSNumber(value: false))\n' +
        '      }\n' +
        '    }\n',
    },
  ];

  for (const ep of extraSdkPatches) {
    const fp = path.join(vcRoot, ...ep.rel);
    if (!fs.existsSync(fp)) {
      console.log(`[postinstall] vision-camera file not found, skipping: ${fp}`);
      continue;
    }
    let s = normalizeLf(fs.readFileSync(fp, 'utf8'));
    const r = replaceOnce(s, normalizeLf(ep.from), normalizeLf(ep.to));
    if (r.ok) {
      fs.writeFileSync(fp, r.out, 'utf8');
      console.log(`[postinstall] Patched vision-camera: ${ep.description}`);
    } else {
      console.log(
        `[postinstall] vision-camera extra SDK patch not applied (already patched or upstream changed): ${ep.description}`
      );
    }
  }

  // ---- Patch 3: iOS 26-only enum cases in various converters (SDK-gated) ----
  const converterPatches = [
    {
      rel: ['ios', 'Extensions', 'Converters', 'AV+ScannedObjectType.swift'],
      description: 'Remove iOS 26 dogHead/catHead direct references',
      edits: [
        {
          from:
            "      } else if #available(iOS 17.0, *), type == .humanFullBody {\n" +
            "        self = .humanFullBody\n" +
            "      } else if #available(iOS 26.0, *), type == .dogHead {\n" +
            "        self = .dogHead\n" +
            "      } else if #available(iOS 26.0, *), type == .catHead {\n" +
            "        self = .catHead\n" +
            "      } else {\n",
          to:
            "      } else if #available(iOS 17.0, *), type == .humanFullBody {\n" +
            "        self = .humanFullBody\n" +
            "      } else {\n",
        },
        {
          from:
            "    case .dogHead:\n" +
            "      if #available(iOS 26.0, *) {\n" +
            "        return .dogHead\n" +
            "      } else {\n" +
            "        return nil\n" +
            "      }\n",
          to: "    case .dogHead:\n      return nil\n",
        },
        {
          from:
            "    case .catHead:\n" +
            "      if #available(iOS 26.0, *) {\n" +
            "        return .catHead\n" +
            "      } else {\n" +
            "        return nil\n" +
            "      }\n",
          to: "    case .catHead:\n      return nil\n",
        },
      ],
    },
    {
      rel: ['ios', 'Extensions', 'Converters', 'AV+TargetColorSpace.swift'],
      description: 'Remove iOS 26 appleLog2 direct reference',
      edits: [
        {
          from:
            "    case .appleLog2:\n" +
            "      if #available(iOS 26.0, *) {\n" +
            "        return .appleLog2\n" +
            "      } else if #available(iOS 17.0, *) {\n" +
            "        return .appleLog\n" +
            "      } else {\n" +
            "        return .HLG_BT2020\n" +
            "      }\n",
          to:
            "    case .appleLog2:\n" +
            "      if #available(iOS 17.0, *) {\n" +
            "        return .appleLog\n" +
            "      } else {\n" +
            "        return .HLG_BT2020\n" +
            "      }\n",
        },
      ],
    },
    {
      rel: ['ios', 'Extensions', 'Converters', 'AV+TargetStabilizationMode.swift'],
      description: 'Remove iOS 26 lowLatency direct reference',
      edits: [
        {
          from:
            "    case .lowLatency:\n" +
            "      if #available(iOS 26.0, *) {\n" +
            "        return .lowLatency\n" +
            "      } else {\n" +
            "        return .standard\n" +
            "      }\n",
          to:
            "    case .lowLatency:\n" +
            "      return .standard\n",
        },
      ],
    },
    {
      rel: ['ios', 'Extensions', 'Converters', 'AV+VideoCodec.swift'],
      description: 'Remove iOS 26 ProRes RAW direct references',
      edits: [
        {
          from:
            "      if #available(iOS 26.0, *) {\n" +
            "        if avCodec == .proResRAW {\n" +
            "          self = .proResRaw\n" +
            "          return\n" +
            "        } else if avCodec == .proResRAWHQ {\n" +
            "          self = .proResRawHq\n" +
            "          return\n" +
            "        }\n" +
            "      }\n",
          to: "",
        },
        {
          from:
            "    case .proResRaw:\n" +
            "      guard #available(iOS 26.0, *) else {\n" +
            "        throw RuntimeError.error(\n" +
            "          withMessage: \"VideoCodec \\\"pro-res-raw\\\" is only available on iOS 18.0 or higher!\")\n" +
            "      }\n" +
            "      return .proResRAW\n",
          to:
            "    case .proResRaw:\n" +
            "      throw RuntimeError.error(withMessage: \"VideoCodec \\\"pro-res-raw\\\" is not supported on this build environment.\")\n",
        },
        {
          from:
            "    case .proResRawHq:\n" +
            "      guard #available(iOS 26.0, *) else {\n" +
            "        throw RuntimeError.error(\n" +
            "          withMessage: \"VideoCodec \\\"pro-res-raw-hq\\\" is only available on iOS 18.0 or higher!\")\n" +
            "      }\n" +
            "      return .proResRAWHQ\n",
          to:
            "    case .proResRawHq:\n" +
            "      throw RuntimeError.error(withMessage: \"VideoCodec \\\"pro-res-raw-hq\\\" is not supported on this build environment.\")\n",
        },
      ],
    },
  ];

  for (const p of converterPatches) {
    const filePath = path.join(vcRoot, ...p.rel);
    if (!fs.existsSync(filePath)) {
      console.log(`[postinstall] vision-camera file not found, skipping: ${filePath}`);
      continue;
    }
    let src = normalizeLf(fs.readFileSync(filePath, 'utf8'));
    let changed = false;
    for (const e of p.edits) {
      const r = replaceOnce(src, normalizeLf(e.from), normalizeLf(e.to));
      if (r.ok) {
        src = r.out;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, src, 'utf8');
      console.log(`[postinstall] Patched vision-camera: ${p.description}`);
    } else {
      console.log(`[postinstall] vision-camera patch not applied (pattern not found): ${p.description}`);
    }
  }
}

main();

