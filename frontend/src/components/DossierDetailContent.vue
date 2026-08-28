<!-- frontend/src/dossierDetailContent/DossierDetailContent.vue : -->
<template>
  <div v-if="dossier" class="dossier-detail-content">
    <DossierSplitLayout :mode="isDocumentFullscreen ? 'fullscreen' : 'preview'">
      <template #left>
        <DossierFilePreview
          :remote-url="previewUrl"
          :remote-name="dossier.fichier_original"
          :loading="previewLoading"
          can-download
          @download="downloadFile"
          @fullscreen="onDocumentFullscreen"
        />
      </template>

      <template #right>
        <!-- =====================================================
        MODE PLEIN ÉCRAN : ACTIONS DU RÔLE
        ===================================================== -->
        <div v-if="isDocumentFullscreen" class="fullscreen-action-panel">
          <!-- =========================
          DISPATCH
          ========================= -->
          <template v-if="auth.role === 'Dispatch'">
            <div class="action-role-title">
              <q-icon name="send" />
              <span>Actions Dispatch</span>
            </div>

            <template v-if="canReuploadVersion">
              <q-banner class="bg-orange-1 text-orange-10 q-mb-md" rounded>
                <template #avatar>
                  <q-icon name="reply" />
                </template>

                Ce dossier a été retourné par le validateur.
              </q-banner>

              <q-btn
                color="primary"
                icon="upload_file"
                label="Importer une nouvelle version"
                class="full-width"
                unelevated
                @click="openReuploadDialog"
              />
            </template>

            <template v-else>
              <div class="text-caption text-grey-7 q-mb-sm">
                Aucune action supplémentaire n'est requise pour ce dossier.
              </div>
            </template>
          </template>

          <!-- =========================
          VERIFICATEUR
          ========================= -->
          <template v-else-if="auth.role === 'Verificateur'">
            <div class="action-role-title">
              <q-icon name="fact_check" />
              <span>Actions Vérificateur</span>
            </div>

            <q-input
              v-model="commentaire"
              type="textarea"
              outlined
              autogrow
              label="Votre commentaire"
              class="q-mb-md"
            />

            <div class="row q-col-gutter-md items-end">
              <div class="col-12 col-md-8">
                <q-select
                  v-model="idValidateur"
                  :options="validateurs"
                  label="Envoyer au validateur *"
                  outlined
                  dense
                  emit-value
                  map-options
                  popup-content-class="fullscreen-select-popup"
                >
                  <!-- OPTION DANS LA LISTE -->
                  <template #option="scope">
                    <q-item v-bind="scope.itemProps">
                      <q-item-section avatar>
                        <q-avatar
                          size="42px"
                          color="primary"
                          text-color="white"
                        >
                          <img
                            v-if="scope.opt.image"
                            :src="scope.opt.image"
                            alt="Photo"
                            @error="$event.target.style.display = 'none'"
                          />

                          <span v-else>
                            {{ initials(scope.opt) }}
                          </span>
                        </q-avatar>
                      </q-item-section>

                      <q-item-section>
                        <q-item-label>
                          {{ scope.opt.label }}
                        </q-item-label>

                        <q-item-label caption>
                          IM : {{ scope.opt.im || "—" }}
                        </q-item-label>
                      </q-item-section>
                    </q-item>
                  </template>

                  <!-- PERSONNE SÉLECTIONNÉE -->
                  <template #selected-item="scope">
                    <q-chip dense class="q-ma-none">
                      <q-avatar size="28px" color="primary" text-color="white">
                        <img
                          v-if="scope.opt.image"
                          :src="scope.opt.image"
                          alt="Photo"
                          @error="$event.target.style.display = 'none'"
                        />

                        <span v-else>
                          {{ initials(scope.opt) }}
                        </span>
                      </q-avatar>

                      {{ scope.opt.label }}
                    </q-chip>
                  </template>
                </q-select>
              </div>

              <div class="col-12 col-md-4">
                <q-btn
                  color="warning"
                  text-color="white"
                  label="Transmettre"
                  icon="send"
                  class="full-width"
                  unelevated
                  :loading="busy"
                  :disable="!commentaire.trim() || !idValidateur"
                  @click="sendValidateur"
                />
              </div>
            </div>
          </template>

          <!-- =========================
          VALIDATEUR
          ========================= -->
          <template v-else-if="auth.role === 'Validateur'">
            <div class="action-role-title">
              <q-icon name="verified" />
              <span>Actions Validateur</span>
            </div>

            <q-input
              v-model="commentaire"
              type="textarea"
              outlined
              autogrow
              label="Votre commentaire"
              class="q-mb-md"
            />

            <q-select
              v-model="idArchiveur"
              :options="archiveurs"
              label="Responsable archivage *"
              outlined
              dense
              emit-value
              map-options
              use-input
              input-debounce="200"
              popup-content-class="fullscreen-select-popup"
              class="q-mb-md"
            >
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section avatar>
                    <q-avatar size="40px" color="warning" text-color="white">
                      <img
                        v-if="scope.opt.image"
                        :src="scope.opt.image"
                        alt="Photo"
                      />
                      <span v-else>
                        {{ initials(scope.opt) }}
                      </span>
                    </q-avatar>
                  </q-item-section>

                  <q-item-section>
                    <q-item-label>
                      {{ scope.opt.label }}
                    </q-item-label>

                    <q-item-label caption>
                      IM : {{ scope.opt.im || "—" }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </template>

              <template #selected-item="scope">
                <q-chip dense class="q-ma-none">
                  <q-avatar size="28px">
                    <img
                      v-if="scope.opt.image"
                      :src="scope.opt.image"
                      alt="Photo"
                    />
                    <span v-else>
                      {{ initials(scope.opt) }}
                    </span>
                  </q-avatar>

                  {{ scope.opt.label }}
                </q-chip>
              </template>
            </q-select>

            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-4">
                <q-btn
                  color="positive"
                  icon="check"
                  label="Valider"
                  class="full-width"
                  unelevated
                  :loading="busy"
                  :disable="!commentaire.trim() || !idArchiveur"
                  @click="decide('valider')"
                />
              </div>

              <div class="col-12 col-md-4">
                <q-btn
                  color="negative"
                  icon="close"
                  label="Rejeter"
                  class="full-width"
                  unelevated
                  :loading="busy"
                  :disable="!commentaire.trim()"
                  @click="decide('rejeter')"
                />
              </div>

              <div class="col-12 col-md-4">
                <q-btn
                  outline
                  color="secondary"
                  icon="undo"
                  label="Retour Dispatch"
                  class="full-width"
                  :loading="busy"
                  :disable="!commentaire.trim()"
                  @click="retourDispatch"
                />
              </div>
            </div>
          </template>

          <!-- =========================
     I_ARCHIVE
========================= -->
          <template v-else-if="auth.role === 'i_archive'">
            <div class="action-role-title">
              <q-icon name="inventory_2" />
              <span>
                {{
                  isQuickArchive ? "Archivage rapide" : "Actions d'archivage"
                }}
              </span>
            </div>

            <!-- =========================
       RÉSUMÉ DU DOSSIER
  ========================== -->
            <div class="fullscreen-archive-summary">
              <div class="fullscreen-summary-title">
                Informations du dossier
              </div>

              <div class="row q-col-gutter-sm">
                <div class="col-6 col-md-2">
                  <div class="fullscreen-summary-label">Exercice</div>
                  <div class="fullscreen-summary-value">
                    {{ dossier.exo_budgetaire || "—" }}
                  </div>
                </div>

                <div class="col-6 col-md-2">
                  <div class="fullscreen-summary-label">N° BE</div>
                  <div class="fullscreen-summary-value">
                    {{ dossier.n_be || "—" }}
                  </div>
                </div>

                <div class="col-6 col-md-2">
                  <div class="fullscreen-summary-label">N° ORD</div>
                  <div class="fullscreen-summary-value">
                    {{ dossier.n_ord || "—" }}
                  </div>
                </div>

                <div class="col-6 col-md-2">
                  <div class="fullscreen-summary-label">N° compte</div>
                  <div class="fullscreen-summary-value">
                    {{ dossier.n_compte || "—" }}
                  </div>
                </div>

                <div class="col-6 col-md-2">
                  <div class="fullscreen-summary-label">N° SOA</div>
                  <div class="fullscreen-summary-value">
                    {{ dossier.n_soa || "—" }}
                  </div>
                </div>

                <div class="col-6 col-md-2">
                  <div class="fullscreen-summary-label">IM archiveur</div>
                  <div class="fullscreen-summary-value">
                    {{ dossier.archiveur_im || "—" }}
                  </div>
                </div>
              </div>
            </div>

            <!-- =========================
       CHAMPS D'ARCHIVAGE
  ========================== -->
            <div class="fullscreen-archive-form">
              <div class="fullscreen-summary-title q-mb-sm">
                Informations d'archivage
              </div>

              <div class="row q-col-gutter-md items-end">
                <!-- COMPTE PC -->
                <div class="col-12 col-md-3">
                  <q-input
                    v-model="archiveForm.compte_pc"
                    label="Compte de prise en charge *"
                    outlined
                    dense
                    maxlength="15"
                  />
                </div>

                <!-- DATE FIN -->
                <div class="col-12 col-md-3">
                  <q-input
                    v-model="archiveForm.date_fin_dossier"
                    label="Date fin du dossier *"
                    type="date"
                    outlined
                    dense
                  />
                </div>

                <!-- RÉF ÉCRITURE -->
                <div class="col-12 col-md-3">
                  <q-input
                    v-model="archiveForm.ref_ecriture"
                    label="Référence d'écriture *"
                    outlined
                    dense
                    maxlength="15"
                  />
                </div>

                <!-- BOUTON -->
                <div class="col-12 col-md-3">
                  <q-btn
                    color="positive"
                    icon="inventory_2"
                    :label="
                      isQuickArchive
                        ? 'Archiver directement'
                        : 'Mettre en archive'
                    "
                    class="full-width"
                    unelevated
                    :loading="archiveLoading"
                    :disable="
                      !archiveForm.compte_pc.trim() ||
                      !archiveForm.date_fin_dossier ||
                      !archiveForm.ref_ecriture.trim()
                    "
                    @click="archiveDossier"
                  />
                </div>
              </div>
            </div>
          </template>

          <!-- =========================
         ADMIN
         ========================= -->
          <template v-else-if="['Admin', 'super_admin'].includes(auth.role)">
            <div class="action-role-title">
              <q-icon name="admin_panel_settings" />
              <span>Actions administrateur</span>
            </div>

            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-4">
                <q-btn
                  color="info"
                  icon="fact_check"
                  label="Vérifier"
                  class="full-width"
                  unelevated
                  :disable="!commentaire.trim()"
                  @click="adminAction('verifier')"
                />
              </div>

              <div class="col-12 col-md-4">
                <q-btn
                  color="positive"
                  icon="check"
                  label="Valider"
                  class="full-width"
                  unelevated
                  :disable="!commentaire.trim()"
                  @click="decide('valider')"
                />
              </div>

              <div class="col-12 col-md-4">
                <q-btn
                  color="negative"
                  icon="close"
                  label="Rejeter"
                  class="full-width"
                  unelevated
                  :disable="!commentaire.trim()"
                  @click="decide('rejeter')"
                />
              </div>
            </div>
          </template>
        </div>

        <!-- =====================================================
       MODE NORMAL : TON PANNEAU ACTUEL
       ===================================================== -->
        <div v-else class="surface-card sticky-panel">
          <div class="row items-center justify-between q-mb-md">
            <div>
              <div class="text-h6 text-weight-bold">
                {{ dossier.nom }}
              </div>

              <q-badge
                :color="statusColor(dossier.statut)"
                class="status-chip q-mt-xs"
              >
                {{ statusLabel(dossier.statut) }}
              </q-badge>
            </div>

            <div class="row q-gutter-xs">
              <q-btn
                flat
                round
                dense
                icon="archive"
                color="secondary"
                @click="exportZip"
              >
                <q-tooltip>Exporter ZIP</q-tooltip>
              </q-btn>
            </div>
          </div>

          <div class="text-caption text-grey-7 q-mb-md">
            Créé le {{ formatDate(dossier.created_at) }}
          </div>

          <!-- =========================
         RESUME DU DOSSIER
         ========================= -->
          <div class="surface-card bg-grey-1 q-mb-md">
            <div class="text-subtitle2 text-weight-bold q-mb-md">
              Résumé du dossier
            </div>
            <template v-if="canReuploadVersion">
              <q-banner class="bg-orange-1 text-orange-10 q-mb-md" rounded>
                <template #avatar>
                  <q-icon name="reply" />
                </template>

                Ce dossier a été retourné par le validateur. Vous pouvez
                importer une nouvelle version.
              </q-banner>

              <q-btn
                color="primary"
                icon="upload_file"
                label="Importer une nouvelle version"
                class="full-width q-mb-md"
                unelevated
                @click="openReuploadDialog"
              />
            </template>

            <div class="row q-col-gutter-md">
              <div class="col-6">
                <div class="text-caption text-grey-7">N° compte</div>

                <div class="text-body2 text-weight-medium">
                  {{ dossier.n_compte || "—" }}
                </div>
              </div>

              <div class="col-6">
                <div class="text-caption text-grey-7">N° BE</div>

                <div class="text-body2 text-weight-medium">
                  {{ dossier.n_be || "—" }}
                </div>
              </div>

              <div class="col-6">
                <div class="text-caption text-grey-7">N° SOA</div>

                <div class="text-body2 text-weight-medium">
                  {{ dossier.n_soa || "—" }}
                </div>
              </div>

              <div class="col-6">
                <div class="text-caption text-grey-7">N° ORD</div>

                <div class="text-body2 text-weight-medium">
                  {{ dossier.n_ord || "—" }}
                </div>
              </div>

              <div class="col-6">
                <div class="text-caption text-grey-7">Exercice</div>

                <div class="text-body2 text-weight-medium">
                  {{ dossier.exo_budgetaire || "—" }}
                </div>
              </div>

              <!-- =========================
     INFORMATIONS D'ARCHIVAGE
     ========================= -->

              <template v-if="showArchiveInfo">
                <div class="col-6">
                  <div class="text-caption text-grey-7">Compte PC</div>

                  <div class="text-body2 text-weight-medium">
                    {{ dossier.compte_pc || "—" }}
                  </div>
                </div>

                <div class="col-6">
                  <div class="text-caption text-grey-7">
                    Date fin du dossier
                  </div>

                  <div class="text-body2 text-weight-medium">
                    {{ formatDateOnly(dossier.date_fin_dossier) }}
                  </div>
                </div>

                <div class="col-6">
                  <div class="text-caption text-grey-7">Réf. écriture</div>

                  <div class="text-body2 text-weight-medium">
                    {{ dossier.ref_ecriture || "—" }}
                  </div>
                </div>

                <div class="col-6">
                  <div class="text-caption text-grey-7">IM de l'archiveur</div>

                  <div class="text-body2 text-weight-medium">
                    {{ dossier.archiveur_im || "—" }}
                  </div>
                </div>
              </template>

              <div class="col-12">
                <div class="text-caption text-grey-7">Fichier</div>

                <div
                  class="text-body2 ellipsis"
                  :title="dossier.fichier_original"
                >
                  {{ dossier.fichier_original || "—" }}
                </div>
              </div>
            </div>
          </div>

          <!-- =========================
          I_ARCHIVE
          ========================= -->
          <template v-if="canArchive">
            <q-banner class="bg-green-1 text-positive q-mb-md" rounded>
              <template #avatar>
                <q-icon name="inventory_2" />
              </template>

              <div class="text-weight-medium">Dossier validé</div>

              <div class="text-caption q-mt-xs">
                Complétez les informations d'archivage avant de mettre
                définitivement le dossier en archive.
              </div>
            </q-banner>

            <div class="text-subtitle2 text-weight-bold q-mb-md">
              Informations d'archivage
            </div>

            <!-- Compte PC -->
            <q-input
              v-model="archiveForm.compte_pc"
              label="Compte de prise en charge *"
              outlined
              maxlength="15"
              class="q-mb-md"
            >
              <template #prepend>
                <q-icon name="account_balance" />
              </template>
            </q-input>

            <!-- Date fin dossier -->
            <q-input
              v-model="archiveForm.date_fin_dossier"
              label="Date fin du dossier *"
              type="date"
              outlined
              class="q-mb-md"
            >
              <template #prepend>
                <q-icon name="event" />
              </template>
            </q-input>

            <!-- Référence écriture -->
            <q-input
              v-model="archiveForm.ref_ecriture"
              label="Référence d'écriture *"
              outlined
              maxlength="15"
              class="q-mb-md"
            >
              <template #prepend>
                <q-icon name="receipt_long" />
              </template>
            </q-input>

            <!-- Bouton archivage -->
            <q-btn
              color="positive"
              icon="inventory_2"
              label="Mettre en archive"
              class="full-width q-mb-md"
              unelevated
              :loading="archiveLoading"
              @click="archiveDossier"
            />

            <q-separator class="q-my-md" />
          </template>

          <!-- =========================
          COMMENTAIRE
          ========================= -->
          <template v-if="!hideCommentSection">
            <div class="text-subtitle2 text-weight-bold q-mb-sm">
              Commentaire
            </div>

            <div
              v-if="dossier.commentaire && dossier.commentaire !== commentaire"
              class="q-mb-sm text-body2 bg-blue-1 q-pa-sm rounded-borders"
              style="white-space: pre-wrap"
            >
              {{ dossier.commentaire }}
            </div>

            <q-input
              v-model="commentaire"
              type="textarea"
              outlined
              autogrow
              label="Votre commentaire"
              class="q-mb-sm"
            />

            <q-btn
              outline
              color="primary"
              label="Enregistrer"
              class="full-width q-mb-md"
              :loading="busy"
              :disable="!commentaire.trim()"
              @click="saveComment"
            />
          </template>

          <!-- =========================
          VERIFICATEUR
          ========================= -->
          <template v-if="canSendToValidateur">
            <q-separator class="q-mb-md" />

            <div class="text-subtitle2 q-mb-sm">Envoyer au validateur</div>

            <q-select
              v-model="idValidateur"
              :options="validateurs"
              label="Validateur"
              outlined
              dense
              emit-value
              map-options
              class="q-mb-sm"
            >
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section avatar>
                    <q-avatar size="40px" color="primary" text-color="white">
                      <img
                        v-if="scope.opt.image"
                        :src="scope.opt.image"
                        alt="Photo"
                      />
                      <span v-else>
                        {{ initials(scope.opt) }}
                      </span>
                    </q-avatar>
                  </q-item-section>

                  <q-item-section>
                    <q-item-label>
                      {{ scope.opt.label }}
                    </q-item-label>

                    <q-item-label caption>
                      IM : {{ scope.opt.im || "—" }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </template>

              <template #selected-item="scope">
                <q-chip dense class="q-ma-none">
                  <q-avatar size="28px">
                    <img
                      v-if="scope.opt.image"
                      :src="scope.opt.image"
                      alt="Photo"
                    />
                    <span v-else>
                      {{ initials(scope.opt) }}
                    </span>
                  </q-avatar>

                  {{ scope.opt.label }}
                </q-chip>
              </template>
            </q-select>

            <q-btn
              color="warning"
              text-color="white"
              label="Transmettre"
              class="full-width q-mb-md"
              unelevated
              :loading="busy"
              :disable="!idValidateur"
              @click="sendValidateur"
            />
          </template>

          <!-- =========================
          VALIDATEUR
          ========================= -->
          <template v-if="canDecide">
            <q-separator class="q-mb-md" />

            <div class="text-subtitle2 q-mb-sm">Décision</div>

            <!-- Responsable de l'archivage -->
            <q-select
              v-model="idArchiveur"
              :options="archiveurs"
              label="Responsable archivage *"
              outlined
              dense
              emit-value
              map-options
              use-input
              input-debounce="200"
              class="q-mb-md"
            >
              <!-- Icône à gauche -->
              <template #prepend>
                <q-icon name="inventory_2" />
              </template>

              <!-- Liste des personnes -->
              <template #option="scope">
                <q-item v-bind="scope.itemProps">
                  <q-item-section avatar>
                    <q-avatar size="40px" color="warning" text-color="white">
                      <img
                        v-if="scope.opt.image"
                        :src="scope.opt.image"
                        alt="Photo"
                        @error="$event.target.style.display = 'none'"
                      />

                      <span v-else>
                        {{ initials(scope.opt) }}
                      </span>
                    </q-avatar>
                  </q-item-section>

                  <q-item-section>
                    <q-item-label>
                      {{ scope.opt.label }}
                    </q-item-label>

                    <q-item-label caption>
                      IM : {{ scope.opt.im || "—" }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </template>

              <!-- Personne sélectionnée -->
              <template #selected-item="scope">
                <q-chip dense class="q-ma-none">
                  <q-avatar size="28px">
                    <img
                      v-if="scope.opt.image"
                      :src="scope.opt.image"
                      alt="Photo"
                      @error="$event.target.style.display = 'none'"
                    />

                    <span v-else>
                      {{ initials(scope.opt) }}
                    </span>
                  </q-avatar>

                  {{ scope.opt.label }}
                </q-chip>
              </template>
            </q-select>

            <div class="row q-gutter-sm q-mb-sm">
              <q-btn
                color="positive"
                label="Valider"
                class="col"
                unelevated
                :loading="busy"
                :disable="!commentaire.trim() || !idArchiveur"
                @click="decide('valider')"
              />

              <q-btn
                color="negative"
                label="Rejeter"
                class="col"
                unelevated
                :loading="busy"
                :disable="!commentaire.trim()"
                @click="decide('rejeter')"
              />
            </div>

            <q-btn
              outline
              color="secondary"
              label="Retour Dispatch"
              class="full-width q-mb-md"
              :loading="busy"
              :disable="!commentaire.trim()"
              @click="retourDispatch"
            />
          </template>

          <!-- =========================
          ADMIN
          ========================= -->
          <template v-if="auth.role === 'Admin' && !canDecide">
            <q-separator class="q-mb-md" />

            <div class="text-subtitle2 q-mb-sm">Admin</div>

            <div class="row q-gutter-sm">
              <q-btn
                color="info"
                label="Vérifier"
                class="col"
                unelevated
                :disable="!commentaire.trim()"
                @click="adminAction('verifier')"
              />

              <q-btn
                color="positive"
                label="Valider"
                class="col"
                unelevated
                :disable="!commentaire.trim()"
                @click="decide('valider')"
              />

              <q-btn
                color="negative"
                label="Rejeter"
                class="col"
                unelevated
                :disable="!commentaire.trim()"
                @click="decide('rejeter')"
              />
            </div>
          </template>

          <!-- =========================
          ACTEURS
          ========================= -->

          <q-separator class="q-my-md" />

          <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">
            Acteurs
          </div>

          <div class="text-body2 q-mb-xs">
            <span class="text-grey-7">Dispatch:</span>
            {{ actor(dossier.dispatch_prenoms, dossier.dispatch_nom) }}
          </div>

          <div class="text-body2 q-mb-xs">
            <span class="text-grey-7">Vérificateur:</span>
            {{ actor(dossier.verificateur_prenoms, dossier.verificateur_nom) }}
          </div>

          <div class="text-body2 q-mb-xs">
            <span class="text-grey-7">Validateur:</span>
            {{ actor(dossier.validateur_prenoms, dossier.validateur_nom) }}
          </div>

          <div class="text-body2">
            <span class="text-grey-7">i_archive:</span>
            {{ actor(dossier.archiveur_prenoms, dossier.archiveur_nom) }}
          </div>
        </div>
      </template>
    </DossierSplitLayout>
  </div>
  <div v-else-if="loading" class="flex flex-center q-pa-xl">
    <q-spinner color="primary" size="40px" />
  </div>
  <q-dialog v-model="showReuploadDialog">
    <q-card style="width: 700px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Importer une nouvelle version</div>

        <div class="text-caption text-grey-7 q-mt-xs">
          Version actuelle : {{ dossier.version }}
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <q-file
          v-model="newVersionFile"
          label="Nouveau fichier *"
          outlined
          clearable
          accept=".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.xls,.xlsx,.txt"
          class="q-mb-md"
        >
          <template #prepend>
            <q-icon name="attach_file" />
          </template>
        </q-file>

        <div class="text-subtitle2 q-mb-md">
          Nouvelles informations du dossier
        </div>

        <div class="row q-col-gutter-md">
          <div class="col-12 col-sm-6">
            <q-input v-model="newVersionNCompte" label="N° compte *" outlined />
          </div>

          <div class="col-12 col-sm-6">
            <q-input v-model="newVersionNBe" label="N° BE *" outlined />
          </div>

          <div class="col-12 col-sm-6">
            <q-input v-model="newVersionNSoa" label="N° SOA *" outlined />
          </div>

          <div class="col-12 col-sm-6">
            <q-input
              v-model="newVersionExoBudgetaire"
              label="Exercice budgétaire *"
              outlined
            />
          </div>

          <div class="col-12">
            <q-select
              v-model="newVersionVerifier"
              :options="verificateurs"
              label="Vérificateur *"
              outlined
              emit-value
              map-options
            />
          </div>
        </div>

        <q-banner class="bg-blue-1 text-primary q-mt-md" rounded>
          <template #avatar>
            <q-icon name="info" />
          </template>

          Les anciens commentaires et l'historique du dossier seront conservés.
        </q-banner>
      </q-card-section>

      <q-separator />

      <q-card-actions align="right">
        <q-btn flat label="Annuler" v-close-popup />

        <q-btn
          color="primary"
          label="Importer la nouvelle version"
          icon="upload"
          unelevated
          :loading="reuploadLoading"
          @click="reuploadVersion"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useQuasar } from "quasar";
import { api } from "boot/axios";
import { useAuthStore } from "stores/auth";
import { statusColor, statusLabel } from "src/utils/status";
import DossierSplitLayout from "components/DossierSplitLayout.vue";
import DossierFilePreview from "components/DossierFilePreview.vue";

const route = useRoute();

const isFromArchives = computed(() => {
  return route.query.from === "archives";
});

const props = defineProps({
  dossierId: { type: [Number, String], required: true },
});

const emit = defineEmits(["updated"]);

const $q = useQuasar();
const auth = useAuthStore();

const dossier = ref(null);
const loading = ref(true);
const busy = ref(false);
const commentaire = ref("");
const idValidateur = ref(null);
const validateurs = ref([]);
const previewUrl = ref(null);
const previewLoading = ref(false);
const showReuploadDialog = ref(false);

const newVersionFile = ref(null);

const newVersionNCompte = ref("");
const newVersionNBe = ref("");
const newVersionNSoa = ref("");
const newVersionExoBudgetaire = ref("");

const newVersionVerifier = ref(null);

const reuploadLoading = ref(false);

const verificateurs = ref([]);

const archiveLoading = ref(false);

const archiveForm = ref({
  compte_pc: "",
  date_fin_dossier: "",
  ref_ecriture: "",
  motif: "",
});

const archiveurs = ref([]);
const idArchiveur = ref(null);

const canArchive = computed(() => {
  if (!dossier.value) return false;

  return auth.role === "i_archive" && dossier.value.statut === "VALIDE";
});

const isDocumentFullscreen = ref(false);

const isQuickArchive = computed(() => {
  return dossier.value?.archivage_rapide === true;
});

const showArchiveInfo = computed(() => {
  return ["i_archive", "Admin", "super_admin"].includes(auth.role);
});

const canComment = computed(() => {
  if (!dossier.value) return false;

  // Si le dossier est consulté depuis les archives,
  // personne ne peut commenter.
  if (isFromArchives.value) {
    return false;
  }

  // Archivage rapide : aucun commentaire
  if (isQuickArchive.value) {
    return false;
  }

  // Les rôles suivants ne commentent jamais
  if (["i_archive", "Admin", "super_admin"].includes(auth.role)) {
    return false;
  }

  switch (dossier.value.statut) {
    case "EN_VERIFICATION":
      return auth.role === "Verificateur";

    case "EN_VALIDATION":
      return auth.role === "Validateur";

    case "RETOUR_DISPATCH":
      return auth.role === "Dispatch";

    default:
      return false;
  }
});

const hideCommentSection = computed(() => {
  return !canComment.value;
});

function onDocumentFullscreen(value) {
  isDocumentFullscreen.value = value;
}

async function loadArchiveurs() {
  const { data } = await api.get("/users", {
    params: {
      role: "i_archive",
    },
  });

  archiveurs.value = data.map((u) => ({
    label: `${u.prenoms} ${u.nom}`,
    value: u.id,
    image: u.image,
    im: u.im,
    email: u.email,
  }));
}

async function archiveDossier() {
  if (!archiveForm.value.compte_pc.trim()) {
    $q.notify({
      type: "negative",
      message: "Le compte de prise en charge est obligatoire.",
    });
    return;
  }

  if (!archiveForm.value.date_fin_dossier) {
    $q.notify({
      type: "negative",
      message: "La date de fin du dossier est obligatoire.",
    });
    return;
  }

  if (!archiveForm.value.ref_ecriture.trim()) {
    $q.notify({
      type: "negative",
      message: "La référence d'écriture est obligatoire.",
    });
    return;
  }

  archiveLoading.value = true;

  try {
    await api.post(`/archives/${props.dossierId}/archive`, archiveForm.value);

    $q.notify({
      type: "positive",
      message: "Dossier archivé définitivement.",
    });

    archiveForm.value = {
      compte_pc: "",
      date_fin_dossier: "",
      ref_ecriture: "",
      motif: "",
    };

    await load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur lors de l'archivage.",
    });
  } finally {
    archiveLoading.value = false;
  }
}

async function loadVerificateurs() {
  const { data } = await api.get("/users", {
    params: {
      role: "Verificateur",
    },
  });

  const admins = await api.get("/users", {
    params: {
      role: "Admin",
    },
  });

  verificateurs.value = [...data, ...admins.data].map((u) => ({
    label: `${u.prenoms} ${u.nom} (${u.email})`,
    value: u.id,
  }));
}

const previewMetadata = computed(() => {
  if (!dossier.value) return {};
  const d = dossier.value;
  return {
    "N° compte": d.n_compte,
    "N° BE": d.n_be,
    "N° SOA": d.n_soa,
    Exercice: d.exo_budgetaire,
    Statut: statusLabel(d.statut),
  };
});

const canSendToValidateur = computed(() => {
  if (!dossier.value) return false;

  return (
    !isFromArchives.value &&
    auth.role === "Verificateur" &&
    ["EN_VERIFICATION", "RETOUR_DISPATCH"].includes(dossier.value.statut)
  );
});

const canDecide = computed(() => {
  if (!dossier.value) return false;

  return (
    !isFromArchives.value &&
    auth.role === "Validateur" &&
    dossier.value.statut === "EN_VALIDATION"
  );
});

const canReuploadVersion = computed(() => {
  if (!dossier.value) return false;

  if (!["Dispatch", "Admin", "super_admin"].includes(auth.role)) {
    return false;
  }

  return dossier.value.statut === "RETOUR_DISPATCH";
});

function openReuploadDialog() {
  newVersionFile.value = null;

  newVersionNCompte.value = dossier.value?.n_compte || "";

  newVersionNBe.value = dossier.value?.n_be || "";

  newVersionNSoa.value = dossier.value?.n_soa || "";

  newVersionExoBudgetaire.value = dossier.value?.exo_budgetaire || "";

  newVersionVerifier.value = dossier.value?.id_verificateur || null;

  showReuploadDialog.value = true;
}

async function reuploadVersion() {
  if (!newVersionFile.value) {
    $q.notify({
      type: "negative",
      message: "Veuillez sélectionner le nouveau fichier.",
    });
    return;
  }

  if (!newVersionNCompte.value.trim()) {
    $q.notify({
      type: "negative",
      message: "Le N° compte est requis.",
    });
    return;
  }

  if (!newVersionNBe.value.trim()) {
    $q.notify({
      type: "negative",
      message: "Le N° BE est requis.",
    });
    return;
  }

  if (!newVersionNSoa.value.trim()) {
    $q.notify({
      type: "negative",
      message: "Le N° SOA est requis.",
    });
    return;
  }

  if (!newVersionExoBudgetaire.value.trim()) {
    $q.notify({
      type: "negative",
      message: "L'exercice budgétaire est requis.",
    });
    return;
  }

  if (!newVersionVerifier.value) {
    $q.notify({
      type: "negative",
      message: "Veuillez sélectionner un vérificateur.",
    });
    return;
  }

  reuploadLoading.value = true;

  try {
    const fd = new FormData();

    fd.append("n_compte", newVersionNCompte.value.trim());

    fd.append("n_be", newVersionNBe.value.trim());

    fd.append("n_soa", newVersionNSoa.value.trim());

    fd.append("exo_budgetaire", newVersionExoBudgetaire.value.trim());

    fd.append("id_verificateur", newVersionVerifier.value);

    fd.append("fichier", newVersionFile.value);

    await api.post(`/dossiers/${props.dossierId}/reupload`, fd);

    $q.notify({
      type: "positive",
      message: "Nouvelle version importée et transmise au vérificateur.",
    });

    showReuploadDialog.value = false;

    await load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message:
        e.response?.data?.error ||
        "Erreur lors de l'import de la nouvelle version",
    });
  } finally {
    reuploadLoading.value = false;
  }
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR");
}

function formatDateOnly(value) {
  if (!value) return "—";

  const text = String(value).slice(0, 10);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (!match) return "—";

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function actor(prenoms, nom) {
  if (!nom && !prenoms) return "—";
  return `${prenoms || ""} ${nom || ""}`.trim();
}

function typeIcon(type) {
  return (
    {
      DISPATCH: "send",
      VERIFICATION: "fact_check",
      VALIDATION: "verified",
      REJET: "cancel",
      RETOUR: "undo",
    }[type] || "info"
  );
}

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
}

async function loadPreview() {
  revokePreview();

  if (!dossier.value?.fichier_original) {
    return;
  }

  previewLoading.value = true;

  const token = localStorage.getItem("token");

  async function fetchPreview() {
    const url =
      `/api/dossiers/${props.dossierId}/preview` + `?preview=${Date.now()}`;

    const response = await fetch(url, {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/pdf,image/*,text/plain,*/*",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },

      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("Le fichier reçu est vide.");
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    return new Blob([blob], {
      type: contentType,
    });
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, 500));

    let blob;

    try {
      blob = await fetchPreview();
    } catch (firstError) {
      console.warn(
        "Première tentative de prévisualisation échouée, nouvelle tentative...",
        firstError,
      );

      await new Promise((resolve) => setTimeout(resolve, 700));

      blob = await fetchPreview();
    }

    previewUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    console.error("Erreur prévisualisation du fichier :", error);

    previewUrl.value = null;

    $q.notify({
      type: "negative",
      message: "Impossible de charger le document après plusieurs tentatives.",
    });
  } finally {
    previewLoading.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get(`/dossiers/${props.dossierId}`);
    dossier.value = data;
    commentaire.value = data.commentaire || "";
    emit("updated", data);
    await loadPreview();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur chargement",
    });
  } finally {
    loading.value = false;
  }
}

async function loadValidateurs() {
  const { data } = await api.get("/users", { params: { role: "Validateur" } });
  const admins = await api.get("/users", { params: { role: "Admin" } });
  validateurs.value = [...data, ...admins.data].map((u) => ({
    label: `${u.prenoms} ${u.nom}`,
    value: u.id,
    image: u.image,
    im: u.im,
    email: u.email,
  }));
}

function initials(user) {
  if (!user) return "?";

  return `${user.prenoms?.[0] || ""}${user.nom?.[0] || ""}`.toUpperCase();
}

async function saveComment() {
  busy.value = true;
  try {
    await api.post(`/dossiers/${props.dossierId}/comment`, {
      commentaire: commentaire.value,
    });
    $q.notify({ type: "positive", message: "Commentaire enregistré" });
    await load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur",
    });
  } finally {
    busy.value = false;
  }
}

async function sendValidateur() {
  busy.value = true;
  try {
    await api.post(`/dossiers/${props.dossierId}/send-validateur`, {
      id_validateur: idValidateur.value,
      commentaire: commentaire.value,
    });
    $q.notify({ type: "positive", message: "Transmis au validateur" });
    await load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur",
    });
  } finally {
    busy.value = false;
  }
}

async function decide(action) {
  if (action === "valider" && !idArchiveur.value) {
    $q.notify({
      type: "negative",
      message: "Veuillez sélectionner le responsable d'archivage.",
    });

    return;
  }

  if (!commentaire.value.trim()) {
    $q.notify({
      type: "negative",
      message: "Un commentaire est requis.",
    });

    return;
  }

  busy.value = true;

  try {
    await api.post(`/dossiers/${props.dossierId}/decide`, {
      action,
      commentaire: commentaire.value,
      id_archiveur: action === "valider" ? idArchiveur.value : null,
    });

    $q.notify({
      type: action === "valider" ? "positive" : "warning",

      message:
        action === "valider"
          ? "Dossier validé et transmis à l'archivage."
          : "Dossier rejeté.",
    });

    idArchiveur.value = null;

    await load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur lors de la décision.",
    });
  } finally {
    busy.value = false;
  }
}

async function retourDispatch() {
  busy.value = true;
  try {
    await api.post(`/dossiers/${props.dossierId}/retour-dispatch`, {
      commentaire: commentaire.value,
    });
    $q.notify({ type: "info", message: "Retour Dispatch" });
    await load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur",
    });
  } finally {
    busy.value = false;
  }
}

async function adminAction(action) {
  busy.value = true;
  try {
    await api.post(`/dossiers/${props.dossierId}/admin-action`, {
      action,
      commentaire: commentaire.value,
    });
    $q.notify({ type: "positive", message: "Action effectuée" });
    await load();
  } catch (e) {
    $q.notify({
      type: "negative",
      message: e.response?.data?.error || "Erreur",
    });
  } finally {
    busy.value = false;
  }
}

async function downloadFile() {
  try {
    const token = localStorage.getItem("token");

    const response = await fetch(`/api/dossiers/${props.dossierId}/download`, {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },

      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("Le fichier téléchargé est vide.");
    }

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download = dossier.value?.fichier_original || "dossier";

    document.body.appendChild(a);

    a.click();

    a.remove();

    // Ne pas libérer immédiatement dans certains navigateurs
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (error) {
    console.error("Erreur téléchargement :", error);

    $q.notify({
      type: "negative",
      message: "Impossible de télécharger le fichier.",
    });
  }
}

async function exportZip() {
  try {
    const res = await api.get(`/dossiers/${props.dossierId}/export`, {
      responseType: "blob",
    });

    const url = URL.createObjectURL(res.data);

    const a = document.createElement("a");

    a.href = url;

    a.download = `${dossier.value?.nom || "dossier"}.zip`;

    document.body.appendChild(a);

    a.click();

    a.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);

    $q.notify({
      type: "positive",
      message: "Export téléchargé",
    });
  } catch (error) {
    console.error("Erreur export ZIP :", error);

    $q.notify({
      type: "negative",
      message:
        error.response?.data?.error || "Erreur lors de l'export du dossier.",
    });
  }
}

watch(() => props.dossierId, load, { immediate: false });

onMounted(async () => {
  await Promise.all([
    load(),
    loadValidateurs(),
    loadVerificateurs(),
    loadArchiveurs(),
  ]);
});

onUnmounted(revokePreview);

defineExpose({ reload: load });
</script>

<style scoped>
:global(.fullscreen-select-popup) {
  z-index: 30000 !important;
}

.fullscreen-archive-summary {
  background: #f7f8fa;
  border: 1px solid #e3e6ea;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 14px;
}

.fullscreen-archive-form {
  background: #ffffff;
}

.fullscreen-summary-title {
  font-size: 14px;
  font-weight: 700;
  color: #374151;
}

.fullscreen-summary-label {
  font-size: 11px;
  color: #6b7280;
  margin-bottom: 2px;
}

.fullscreen-summary-value {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
