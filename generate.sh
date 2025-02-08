#!/bin/bash

build_glyphs_bin="../node-fontnik/bin/build-glyphs"
variants="plex-sans plex-sans-arabic plex-sans-devanagari plex-sans-hebrew plex-sans-jp plex-sans-kr plex-sans-sc plex-sans-tc plex-sans-thai"
weights="Thin ExtraLight Light Regular Text Medium SemiBold Bold"

for variant in $variants
do
  wget https://github.com/IBM/plex/releases/download/%40ibm%2F${variant}%401.1.0/ibm-${variant}.zip -P tmp
  case $variant in
    plex-sans-jp|plex-sans-kr|plex-sans-sc|plex-sans-tc)
      unzip -j tmp/ibm-${variant}.zip ibm-${variant}/fonts/complete/ttf/hinted/*.ttf -d tmp/ibm-${variant} ;;
    *)
      unzip -j tmp/ibm-${variant}.zip ibm-${variant}/fonts/complete/ttf/*.ttf -d tmp/ibm-${variant} ;;
  esac
  rm -f tmp/ibm-${variant}.zip

  for ttf in tmp/ibm-${variant}/*.ttf
  do
    mkdir -p ${ttf%.*}
    echo "building glyphs: $ttf"
    $build_glyphs_bin $ttf ${ttf%.*}
  done
done

for weight in $weights
do
  cmd="node dist/combine --output output/IBMPlexSans-${weight}"
  for variant in $variants; do
    cmd+=" tmp/ibm-${variant}/*-${weight}"
  done
  echo "generating: output/IBMPlexSans-${weight}"
  $cmd
done

rm -rf tmp
