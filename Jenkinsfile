pipeline {

    agent {
        // label "" also could have been 'agent any' - that has the same meaning.
        label "master"
    }

    environment {
        // Global Vars
        NAMESPACE_PREFIX="gabriel"
        GITLAB_DOMAIN = "github.com"
        GITLAB_USERNAME = "gsampaio-rh"

        PIPELINES_NAMESPACE = "${NAMESPACE_PREFIX}-ci-cd"
        APP_NAME = "todolist"

        JENKINS_TAG = "${JOB_NAME}.${BUILD_NUMBER}".replace("/", "-")
        JOB_NAME = "${JOB_NAME}".replace("/", "-")

        GIT_SSL_NO_VERIFY = true
        GIT_CREDENTIALS = credentials("${NAMESPACE_PREFIX}-ci-cd-gitlab-auth")
    }

    // The options directive is for configuration that applies to the whole job.
    options {
        buildDiscarder(logRotator(numToKeepStr:'10'))
        timeout(time: 15, unit: 'MINUTES')
        ansiColor('xterm')
        timestamps()
    }

    stages {
        stage("Slack Start Build") {
            agent {
                node {
                    label "master"
                }
            }
            steps {
                slackSend (color: '#80B0C4', message: """*[REQUEST]* *START BUILD ?* ${env.BUILD_URL} 
                ```${env.JOB_BASE_NAME} ${env.BUILD_DISPLAY_NAME} \n${env.JOB_URL}```""")
                // send build started notifications
                script {
                    def IS_APPROVED = input(
                        message: "Approve release?",
                        ok: "y",
                        submitter: "admin",
                        parameters: [
                            string(name: 'IS_APPROVED', defaultValue: 'y', description: 'Start Build?')
                        ]
                    )
                    if (IS_APPROVED != 'y') {
                        currentBuild.result = "ABORTED"
                        error "User cancelled"
                    }
                }
            }
        }
        
        stage("prepare environment for master deploy") {
            agent {
                node {
                    label "master"
                }
            }
            when {
              expression { GIT_BRANCH ==~ /(.*master)/ }
            }
            steps {
                script {
                    // Arbitrary Groovy Script executions can do in script tags
                    env.PROJECT_NAMESPACE = "${NAMESPACE_PREFIX}-test"
                    env.NODE_ENV = "test"
                    env.E2E_TEST_ROUTE = "oc get route/${APP_NAME} --template='{{.spec.host}}' -n ${PROJECT_NAMESPACE}".execute().text.minus("'").minus("'")
                }
            }
        }
        stage("prepare environment for develop deploy") {
            agent {
                node {
                    label "master"
                }
            }
            when {
              expression { GIT_BRANCH ==~ /(.*develop)/ }
            }
            steps {
                // send build started notifications
                
                script {
                    // Arbitrary Groovy Script executions can do in script tags
                    env.PROJECT_NAMESPACE = "${NAMESPACE_PREFIX}-dev"
                    env.NODE_ENV = "dev"
                    env.E2E_TEST_ROUTE = "oc get route/${APP_NAME} --template='{{.spec.host}}' -n ${PROJECT_NAMESPACE}".execute().text.minus("'").minus("'")
                }
            }
        }
        stage("node-build") {
            agent {
                node {
                    label "jenkins-slave-npm"
                }
            }
            steps {
                slackSend (color: '#FFFF00', message: "STARTED: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
                sh 'printenv'

                echo '### Install deps ###'
                sh 'npm install'

                echo '### Running linting ###'
                //sh 'npm run lint'

                echo '### Running tests ###'
                //sh 'npm run test:all:ci'

                echo '### Running build ###'
                sh 'npm run build:ci'

                echo '### Packaging App for Nexus ###'
                sh 'npm run package'
                sh 'npm run publish'
                stash 'source'
            }
            // Post can be used both on individual stages and for the entire build.
            post {
                always {
                    //archive "**"
                    // // ADD TESTS REPORTS HERE
                    // junit 'test-report.xml'
                    // junit 'reports/server/mocha/test-results.xml'

                    // // publish html
                    // publishHTML target: [
                    //   allowMissing: false,
                    //   alwaysLinkToLastBuild: false,
                    //   keepAll: true,
                    //   reportDir: 'reports/coverage',
                    //   reportFiles: 'index.html',
                    //   reportName: 'Code Coverage'
                    // ]

                }
                success {
                    slackSend (color: '#00FF00', message: "SUCCESSFUL: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
                    echo "Git tagging"
                    sh'''
                        git config --global user.email "jenkins@jmail.com"
                        git config --global user.name "jenkins-ci"
                        git tag -a ${JENKINS_TAG} -m "JENKINS automated commit"
                        git push https://${GIT_CREDENTIALS_USR}:${GIT_CREDENTIALS_PSW}@${GITLAB_DOMAIN}/${GITLAB_USERNAME}/${APP_NAME}.git --tags
                    '''
                }
                failure {
                    slackSend (color: '#FF0000', message: "FAILED: Job '${env.JOB_NAME} [${env.BUILD_NUMBER}]' (${env.BUILD_URL})")
                    echo "FAILURE"
                }
            }
        }

        stage("node-bake") {
            agent {
                node {
                    label "master"
                }
            }
            when {
                expression { GIT_BRANCH ==~ /(.*master|.*develop)/ }
            }
            steps {
                echo '### Get Binary from Nexus ###'
                sh  '''
                        rm -rf package-contents*
                        curl -v -f http://admin:admin123@${NEXUS_SERVICE_HOST}:${NEXUS_SERVICE_PORT}/repository/zip/com/redhat/todolist/${JENKINS_TAG}/package-contents.zip -o package-contents.zip
                        unzip package-contents.zip
                    '''
                echo '### Create Linux Container Image from package ###'
                sh  '''
                        oc project ${PIPELINES_NAMESPACE} # probs not needed
                        oc patch bc ${APP_NAME} -p "{\\"spec\\":{\\"output\\":{\\"to\\":{\\"kind\\":\\"ImageStreamTag\\",\\"name\\":\\"${APP_NAME}:${JENKINS_TAG}\\"}}}}"
                        oc start-build ${APP_NAME} --from-dir=package-contents/ --follow
                    '''
            }
            post {
                always {
                    archive "**"
                }
            }
        }

        stage("node-deploy") {
            agent {
                node {
                    label "master"
                }
            }
            when {
                expression { GIT_BRANCH ==~ /(.*master|.*develop)/ }
            }
            steps {
                echo '### tag image for namespace ###'
                sh  '''
                    oc project ${PROJECT_NAMESPACE}
                    oc tag ${PIPELINES_NAMESPACE}/${APP_NAME}:${JENKINS_TAG} ${PROJECT_NAMESPACE}/${APP_NAME}:${JENKINS_TAG}
                    '''
                echo '### set env vars and image for deployment ###'
                sh '''
                    oc set env dc ${APP_NAME} NODE_ENV=${NODE_ENV}
                    oc set image dc/${APP_NAME} ${APP_NAME}=docker-registry.default.svc:5000/${PROJECT_NAMESPACE}/${APP_NAME}:${JENKINS_TAG}
                    oc rollout latest dc/${APP_NAME}
                '''
                echo '### Verify OCP Deployment ###'
                openshiftVerifyDeployment depCfg: env.APP_NAME,
                    namespace: env.PROJECT_NAMESPACE,
                    replicaCount: '1',
                    verbose: 'false',
                    verifyReplicaCount: 'true',
                    waitTime: '',
                    waitUnit: 'sec'
            }
        }
        // stage("e2e test") {
        //   agent {
        //         node {
        //             label "jenkins-slave-npm"
        //         }
        //     }
        //     when {
        //         expression { GIT_BRANCH ==~ /(.*master|.*develop)/ }
        //     }
        //     steps {
        //       unstash 'source'

        //       echo '### Install deps ###'
        //       sh 'npm install'

        //       echo '### Running end to end tests ###'
        //       sh 'npm run e2e:jenkins'
        //     }
        //     post {
        //         always {
        //             junit 'reports/e2e/specs/*.xml'
        //         }
        //     }
        // }
        // stage('Arachni Scan') {
        //   agent {
        //       node {
        //           label "jenkins-slave-arachni"
        //       }
        //   }
        //   when {
        //       expression { GIT_BRANCH ==~ /(.*master|.*develop)/ }
        //   }
        //   steps {
        //       sh '''
        //           /arachni/bin/arachni http://${E2E_TEST_ROUTE} --report-save-path=arachni-report.afr
        //           /arachni/bin/arachni_reporter arachni-report.afr --reporter=xunit:outfile=report.xml --reporter=html:outfile=web-report.zip
        //           unzip web-report.zip -d arachni-web-report
        //       '''
        //   }
        //   post {
        //       always {
        //           junit 'report.xml'
        //           publishHTML target: [
        //               allowMissing: false,
        //               alwaysLinkToLastBuild: false,
        //               keepAll: true,
        //               reportDir: 'arachni-web-report',
        //               reportFiles: 'index.html',
        //               reportName: 'Arachni Web Crawl'
        //               ]
        //       }
        //   }
        // }
    }
}
