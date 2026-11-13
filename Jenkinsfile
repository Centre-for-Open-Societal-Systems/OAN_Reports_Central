// OAN Reports Central: build the api and ui images, push them to ECR, package the Helm chart with
// those images, deploy it to New Dev (the registries cluster, namespace reports) and publish the same archive
// to oan-helm.
//
// Multibranch job. Every branch and pull request builds the images and lints the chart; only the
// developer branch pushes, deploys and publishes. Images follow the registries' oan/<repository>/<image> naming,
// oan/oan_reports_central/oan-report-central-{api,ui}, tagged <Chart.yaml appVersion>.develop.<build number>
// (e.g. 0.0.0.develop.42). The chart of that commit is
// 0.0.0-develop.<commit count> (oan-helm scripts/ci/derive-version.sh), published to repository/develop/.
//
// Jenkins credentials:
//   aws-ecr-creds                  AWS keys with ECR create-repository and push on oan/oan_reports_central/* (shared with farmer-registry)
//   reports-dev-kubeconfig         Secret file: kubeconfig of the namespace reports deployer on New Dev
//   oan-helm-fork-token            Username + token with push access to oan-helm (shared with farmer-registry)
pipeline {
    agent any
    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        // Build agents are on-demand spot machines: if one is reclaimed mid-build, run the build again.
        retry(count: 2, conditions: [agent(), nonresumable()])
        timestamps()
        timeout(time: 45, unit: 'MINUTES')
    }
    environment {
        AWS_REGION = 'ap-south-1'
        ECR_REPOSITORY = 'oan/oan_reports_central'
        CHART = 'oan-reports-central'
        HELM_RELEASE = 'oan-reports-central'
        HELM_NAMESPACE = 'reports'
        VALUES_OVERLAY = 'helm/oan-reports-central/values-dev-registries.yaml'
        DEV_HOST = 'oan-reports.development.oanstaging.com'
        // New Dev's public IP: the health check reaches the new release whatever DNS still points at.
        DEV_IP = '13.201.58.55'
        KUBECONFIG_CREDENTIAL = 'reports-dev-kubeconfig'
        OAN_HELM_FORK_CRED_ID = 'oan-helm-fork-token'
        OAN_HELM = 'https://github.com/Centre-for-Open-Societal-Systems/oan-helm.git'
    }
    stages {
        stage('Build') {
            steps {
                checkout scm
                script {
                    // checkout scm does not always export GIT_COMMIT: resolve the workspace revision.
                    def commit = sh(returnStdout: true, script: 'git rev-parse --verify HEAD').trim()
                    if (!(commit ==~ /[0-9a-f]{40}/)) {
                        error('Could not resolve the checked-out Git commit')
                    }
                    env.SOURCE_COMMIT = commit
                    def appVersion = sh(returnStdout: true,
                                        script: 'sed -n "s/^appVersion: *//p" "helm/$CHART/Chart.yaml" | tr -d \'"\'').trim()
                    if (!(appVersion ==~ /\d+\.\d+\.\d+/)) {
                        error("helm/${env.CHART}/Chart.yaml appVersion '${appVersion}' is not N.N.N")
                    }
                    // The developer branch is this repository's develop line, so the tag says develop.
                    env.IMAGE_TAG = "${appVersion}.develop.${env.BUILD_NUMBER}"
                    currentBuild.description = "images ${env.IMAGE_TAG}"
                }
                sh '''
                    set -eu
                    docker build -t "coss-ci/oan-report-central-api:$IMAGE_TAG" backend
                    docker build -t "coss-ci/oan-report-central-ui:$IMAGE_TAG" frontend
                '''
            }
        }
        stage('Push to ECR') {
            when { allOf { branch 'developer'; not { changeRequest() } } }
            steps {
                withCredentials([[$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-ecr-creds']]) {
                    script {
                        env.ECR_REGISTRY = sh(returnStdout: true, script: '''
                          set +x
                          account=$(aws sts get-caller-identity --query Account --output text)
                          case "$account" in *[!0-9]*|'') exit 1 ;; esac
                          test "${#account}" = 12
                          printf '%s.dkr.ecr.%s.amazonaws.com' "$account" "$AWS_REGION"
                        ''').trim()
                    }
                    sh '''
                        set -eu
                        set +x
                        export DOCKER_CONFIG
                        DOCKER_CONFIG=$(mktemp -d)
                        trap 'rm -rf "$DOCKER_CONFIG"' EXIT
                        aws ecr get-login-password --region "$AWS_REGION" |
                          docker login --username AWS --password-stdin "$ECR_REGISTRY"
                        mkdir -p build-outcomes
                        # One line per image for oan-helm package_chart.py: values path, repository, tag@digest.
                        : > build-outcomes/images.tsv
                        # Chart component (values path) and image: the web component serves the ui image.
                        for pair in api:oan-report-central-api web:oan-report-central-ui; do
                          component=${pair%%:*}
                          image=${pair#*:}
                          repository="$ECR_REPOSITORY/$image"
                          # ECR does not create repositories on push: the first build of an image creates its own.
                          aws ecr describe-repositories --region "$AWS_REGION" --repository-names "$repository" > /dev/null 2>&1 ||
                            aws ecr create-repository --region "$AWS_REGION" --repository-name "$repository" \
                              --image-scanning-configuration scanOnPush=true > /dev/null
                          docker tag "coss-ci/$image:$IMAGE_TAG" "$ECR_REGISTRY/$repository:$IMAGE_TAG"
                          docker push "$ECR_REGISTRY/$repository:$IMAGE_TAG"
                          digest=$(aws ecr describe-images --region "$AWS_REGION" --repository-name "$repository" \
                            --image-ids "imageTag=$IMAGE_TAG" --query 'imageDetails[0].imageDigest' --output text)
                          case "$digest" in sha256:*) ;; *) echo "no digest for $repository:$IMAGE_TAG" >&2; exit 1 ;; esac
                          printf '%s.image\t%s\t%s@%s\n' "$component" "$ECR_REGISTRY/$repository" "$IMAGE_TAG" "$digest" \
                            >> build-outcomes/images.tsv
                        done
                        cat build-outcomes/images.tsv
                    '''
                }
                stash name: 'images', includes: 'build-outcomes/images.tsv'
            }
        }
        stage('Release') {
            // The deploy agent is in the VPC of New Dev and reaches its Kubernetes API.
            when {
                beforeAgent true
                allOf { branch 'developer'; not { changeRequest() } }
            }
            agent { label 'oan-ci-deploy' }
            stages {
                stage('Package chart') {
                    // The chart with this build's images written into its values. Deploy installs this archive and
                    // Publish adds the same file to oan-helm, so dev runs exactly what oan-helm lists.
                    steps {
                        checkout scm
                        sh 'rm -rf build-outcomes built-chart .oan-helm'
                        unstash 'images'
                        script {
                            env.CHART_ARCHIVE = sh(returnStdout: true, script: '''
                                set -eu
                                # The chart version is the commit count, so it needs the full history.
                                if [ "$(git rev-parse --is-shallow-repository)" = true ]; then git fetch -q --unshallow; fi
                                git clone -q --depth 1 --filter=blob:none --sparse "$OAN_HELM" .oan-helm
                                git -C .oan-helm sparse-checkout set scripts/ci
                                source_repository=$(git config --get remote.origin.url |
                                  sed -E 's#^(https://[^/]+/|git@[^:]+:)##; s#\\.git$##')
                                # The developer branch is this repository's develop line: same version and channel.
                                python3 .oan-helm/scripts/ci/package_chart.py \
                                  --chart "helm/$CHART" --images build-outcomes/images.tsv --output built-chart \
                                  --source-repository "$source_repository" --source-commit "$SOURCE_COMMIT" \
                                  --subject "$(git log -1 --pretty=%s)" --release "$HELM_RELEASE" \
                                  --namespace "$HELM_NAMESPACE" --overlay "$VALUES_OVERLAY" --branch develop
                            ''').trim().readLines().last()
                        }
                        sh 'helm lint "$CHART_ARCHIVE" -f "$VALUES_OVERLAY"'
                        archiveArtifacts artifacts: 'built-chart/*.tgz,build-outcomes/images.tsv'
                    }
                }
                stage('Deploy to dev') {
                    steps {
                        withCredentials([file(credentialsId: env.KUBECONFIG_CREDENTIAL, variable: 'KUBECONFIG')]) {
                            // --atomic rolls the release back to the previous revision if the upgrade fails.
                            sh '''
                                set -eu
                                helm upgrade --install "$HELM_RELEASE" "$CHART_ARCHIVE" \
                                  -n "$HELM_NAMESPACE" -f "$VALUES_OVERLAY" \
                                  --atomic --wait --timeout 10m
                                helm history "$HELM_RELEASE" -n "$HELM_NAMESPACE" --max 3
                                kubectl -n "$HELM_NAMESPACE" get pods -o wide
                            '''
                        }
                        sh '''
                            set -eu
                            for attempt in 1 2 3 4 5 6; do
                              if curl -fsS -m 10 --resolve "$DEV_HOST:443:$DEV_IP" "https://$DEV_HOST/api/health"; then echo; exit 0; fi
                              sleep 10
                            done
                            echo "https://$DEV_HOST/api/health on $DEV_IP did not answer after the deploy" >&2
                            exit 1
                        '''
                    }
                }
                stage('Publish chart to oan-helm') {
                    // Only after a successful deploy. Adds the archive to repository/develop/ of oan-helm; its
                    // workflow then updates the index, CHANGELOG.md and the rollback history. If publishing fails
                    // the build is UNSTABLE: dev already runs this build.
                    steps {
                        catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
                            withCredentials([usernamePassword(credentialsId: env.OAN_HELM_FORK_CRED_ID, usernameVariable: 'GH_USER', passwordVariable: 'GH_TOKEN')]) {
                                sh '''
                                    set +e
                                    python3 .oan-helm/scripts/ci/publish_chart.py "$CHART_ARCHIVE"
                                    status=$?
                                    # 4: a rerun of this commit, the version is already published.
                                    [ "$status" -eq 4 ] && exit 0
                                    exit "$status"
                                '''
                            }
                        }
                    }
                }
            }
        }
    }
    post {
        failure {
            script {
                // Mail the DevOps list and the commit author; a controller without SMTP must not hide the failure.
                try {
                    def author = ''
                    try { author = sh(script: "git log -1 --pretty=format:'%ae'", returnStdout: true).trim() } catch (ignored) { author = '' }
                    def recipients = ['simretyibeltal@gmail.com', 'pavanns.ns@gmail.com']
                    if (author && !author.contains('noreply')) { recipients = [author] + recipients }
                    mail(
                        to: recipients.unique().join(', '),
                        subject: "Build FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                        body: "OAN Reports Central build or deploy failed.\n\nJob:     ${env.JOB_NAME}\nBranch:  ${env.BRANCH_NAME}\nBuild:   #${env.BUILD_NUMBER}\nURL:     ${env.BUILD_URL}\nConsole: ${env.BUILD_URL}console\n\nJenkins"
                    )
                } catch (err) {
                    echo "notification not sent: ${err.message}"
                }
            }
        }
    }
}
