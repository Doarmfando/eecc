from pathlib import Path
from shutil import rmtree
from unittest import TestCase
from uuid import uuid4

from statement_worker.domain.errors import (
    ArtifactAlreadyExistsError,
    ArtifactPublicationError,
)
from statement_worker.services.atomic_artifact import (
    ArtifactPlan,
    publish_artifact_atomically,
    publish_artifacts_atomically,
)


class AtomicArtifactTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_atomic_artifact_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)

    def test_publishes_only_after_verification_and_removes_temporary(self) -> None:
        target = self.directory / "statement.xlsx"
        calls: list[str] = []

        def writer(path: Path) -> None:
            calls.append("write")
            path.write_bytes(b"synthetic workbook bytes")

        def verifier(path: Path) -> None:
            calls.append("verify")
            self.assertNotEqual(path, target)
            self.assertEqual(path.read_bytes(), b"synthetic workbook bytes")
            self.assertFalse(target.exists())

        publish_artifact_atomically(target, writer=writer, verifier=verifier)

        self.assertEqual(calls, ["write", "verify"])
        self.assertEqual(target.read_bytes(), b"synthetic workbook bytes")
        self.assertEqual(list(self.directory.glob(".eecc_artifact_*")), [])

    def test_verification_failure_does_not_publish_and_cleans_temporary(self) -> None:
        target = self.directory / "statement.xlsx"

        def verifier(_path: Path) -> None:
            raise ArtifactPublicationError("Synthetic verification failure")

        with self.assertRaises(ArtifactPublicationError):
            publish_artifact_atomically(
                target,
                writer=lambda path: path.write_bytes(b"invalid"),
                verifier=verifier,
            )

        self.assertFalse(target.exists())
        self.assertEqual(list(self.directory.glob(".eecc_artifact_*")), [])

    def test_rejects_empty_output_and_missing_parent(self) -> None:
        with self.assertRaises(ArtifactPublicationError):
            publish_artifact_atomically(
                self.directory / "empty.xlsx",
                writer=lambda _path: None,
                verifier=lambda _path: None,
            )
        with self.assertRaises(ArtifactPublicationError):
            publish_artifact_atomically(
                self.directory / "missing" / "statement.xlsx",
                writer=lambda _path: None,
                verifier=lambda _path: None,
            )

    def test_preserves_existing_target_unless_overwrite_is_explicit(self) -> None:
        target = self.directory / "statement.xlsx"
        target.write_bytes(b"previous")

        with self.assertRaises(ArtifactAlreadyExistsError):
            publish_artifact_atomically(
                target,
                writer=lambda path: path.write_bytes(b"new"),
                verifier=lambda _path: None,
            )
        self.assertEqual(target.read_bytes(), b"previous")

        publish_artifact_atomically(
            target,
            writer=lambda path: path.write_bytes(b"new"),
            verifier=lambda _path: None,
            overwrite=True,
        )
        self.assertEqual(target.read_bytes(), b"new")


class AtomicArtifactBundleTests(TestCase):
    def setUp(self) -> None:
        self.directory = Path.cwd() / f".test_atomic_bundle_{uuid4().hex}"
        self.directory.mkdir()
        self.addCleanup(rmtree, self.directory, True)

    def _plan(self, name: str, *, payload: bytes = b"contenido") -> ArtifactPlan:
        return ArtifactPlan(
            target=self.directory / name,
            writer=lambda path, payload=payload: path.write_bytes(payload),
            verifier=lambda _path: None,
        )

    def test_writes_and_verifies_every_artifact_before_publishing_any(self) -> None:
        order: list[str] = []

        def plan(name: str, *, fails: bool = False) -> ArtifactPlan:
            def writer(path: Path) -> None:
                order.append(f"write:{name}")
                path.write_bytes(b"contenido")

            def verifier(_path: Path) -> None:
                order.append(f"verify:{name}")
                if fails:
                    raise ArtifactPublicationError("Synthetic verification failure")

            return ArtifactPlan(target=self.directory / name, writer=writer, verifier=verifier)

        with self.assertRaises(ArtifactPublicationError):
            publish_artifacts_atomically((plan("first"), plan("second", fails=True)))

        self.assertEqual(order, ["write:first", "verify:first", "write:second", "verify:second"])
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_rejects_empty_bundles_and_repeated_targets(self) -> None:
        with self.assertRaises(ArtifactPublicationError):
            publish_artifacts_atomically(())
        with self.assertRaises(ArtifactPublicationError):
            publish_artifacts_atomically((self._plan("same.csv"), self._plan("same.csv")))
        self.assertEqual(list(self.directory.iterdir()), [])

    def test_publishes_the_whole_bundle_when_every_artifact_verifies(self) -> None:
        publish_artifacts_atomically((self._plan("one.csv"), self._plan("two.csv")))

        self.assertEqual(
            sorted(path.name for path in self.directory.iterdir()),
            ["one.csv", "two.csv"],
        )

    def test_a_target_created_during_the_write_never_gets_overwritten(self) -> None:
        target = self.directory / "raced.csv"

        def writer(path: Path) -> None:
            path.write_bytes(b"nuevo")
            target.write_bytes(b"escrito por otro proceso")

        with self.assertRaises(ArtifactAlreadyExistsError):
            publish_artifacts_atomically(
                (ArtifactPlan(target=target, writer=writer, verifier=lambda _path: None),)
            )

        self.assertEqual(target.read_bytes(), b"escrito por otro proceso")
        self.assertEqual(list(self.directory.glob(".eecc_artifact_*")), [])

    def test_a_race_on_a_later_artifact_retires_the_ones_already_published(self) -> None:
        first = self.directory / "first.csv"
        second = self.directory / "second.csv"

        def racing_writer(path: Path) -> None:
            path.write_bytes(b"nuevo")
            second.write_bytes(b"escrito por otro proceso")

        with self.assertRaises(ArtifactAlreadyExistsError):
            publish_artifacts_atomically(
                (
                    self._plan("first.csv"),
                    ArtifactPlan(target=second, writer=racing_writer, verifier=lambda _p: None),
                )
            )

        self.assertFalse(first.exists())
        self.assertEqual(second.read_bytes(), b"escrito por otro proceso")
        self.assertEqual(list(self.directory.glob(".eecc_artifact_*")), [])

    def test_a_locked_temporary_does_not_mask_the_writer_failure(self) -> None:
        target = self.directory / "locked.csv"
        handles: list[object] = []

        def writer(path: Path) -> None:
            handle = path.open("wb")
            handles.append(handle)
            handle.write(b"contenido a medias")
            handle.flush()
            raise RuntimeError("Synthetic writer failure")

        self.addCleanup(lambda: [handle.close() for handle in handles])  # type: ignore[attr-defined]

        with self.assertRaises(RuntimeError):
            publish_artifacts_atomically(
                (ArtifactPlan(target=target, writer=writer, verifier=lambda _p: None),)
            )

        self.assertFalse(target.exists())
