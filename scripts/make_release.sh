#!/bin/bash
# make_release.sh will create a build package ready for publishing.
set -e

ROOT=$(dirname $0)/..
PUBDIR=$(mktemp -du)
GITVER=$(git rev-parse HEAD)
PUBFILE=$(dirname ${PUBDIR})/${GITVER}.tgz
declare -a PUBTARGETS=(${GITVER} $(git describe --tags 2>/dev/null) $(git rev-parse --abbrev-ref HEAD))

# Copy the pack.
mkdir -p $PUBDIR
cp -R ${ROOT}/bin/. ${PUBDIR}/
echo . >> ${PUBDIR}/packs.txt
echo . @pulumi/pulumi-fabric >> ${PUBDIR}/packdeps.txt
echo . @pulumi/aws >> ${PUBDIR}/packdeps.txt

# Tar up the file and then print it out for use by the caller or script.
tar -czf ${PUBFILE} -C ${PUBDIR} .
echo ${PUBFILE} ${PUBTARGETS[@]}
